/**
 * A small JSON Schema checker, for the part of draft 2020-12 that this repository's schemas use: type, const, enum,
 * properties, required, additionalProperties, items, minItems, maxItems, uniqueItems, minLength, maxLength, pattern,
 * minimum, maximum, if/then/else, and $ref (to "#/$defs/…" or to another schema by its file name). Other keywords are
 * ignored.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type Schema = { [keyword: string]: unknown };

/** The schemas in `schema/`, by file name, so one can refer to another. */
export async function loadSchemas(directory: string): Promise<Record<string, Schema>> {
    const names = ["entry.schema.json", "theme.schema.json", "index.schema.json"];
    const schemas: Record<string, Schema> = {};

    for (const name of names) {
        schemas[name] = JSON.parse(await readFile(join(directory, name), "utf8")) as Schema;
    }

    return schemas;
}

/** JSON with the keys of every object in order, so two equal values give the same text. */
function canonical(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(canonical).join(",")}]`;
    }

    if (typeof value === "object" && value !== null) {
        const keys = Object.keys(value).sort();

        return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical((value as Schema)[key])}`).join(",")}}`;
    }

    return JSON.stringify(value);
}

function typeOf(value: unknown): string {
    if (value === null) {
        return "null";
    }

    if (Array.isArray(value)) {
        return "array";
    }

    return typeof value;
}

function hasType(value: unknown, type: string): boolean {
    if (type === "integer") {
        return Number.isInteger(value);
    }

    return typeOf(value) === type;
}

/**
 * The problems of `value` against `schema`, each with where it is (`files[0].sha256`). Empty when there are none.
 * `schemas` are the schemas a `$ref` can name by file; `root` is the schema that `#/$defs/…` is in.
 */
export function check(
    value: unknown,
    schema: Schema,
    schemas: Record<string, Schema>,
    where = "",
    root: Schema = schema,
): string[] {
    const at = where === "" ? "the value" : where;
    const problems: string[] = [];

    if (typeof schema.$ref === "string") {
        const ref = schema.$ref;
        const target = ref.startsWith("#/$defs/")
            ? (root.$defs as Record<string, Schema>)[ref.slice(8)]
            : schemas[ref];

        if (target === undefined) {
            throw new Error(`The schema has a $ref to ${ref}, which is not there`);
        }

        problems.push(...check(value, target, schemas, where, ref.startsWith("#") ? root : target));
    }

    // An entry is an extension's or, with kind "theme", a theme's: `if` picks the schema that applies.
    if (typeof schema.if === "object" && schema.if !== null) {
        const branch =
            check(value, schema.if as Schema, schemas, where, root).length === 0
                ? schema.then
                : schema.else;

        if (typeof branch === "object" && branch !== null) {
            problems.push(...check(value, branch as Schema, schemas, where, root));
        }
    }

    if (schema.type !== undefined) {
        const types = Array.isArray(schema.type)
            ? (schema.type as string[])
            : [schema.type as string];

        if (!types.some((type) => hasType(value, type))) {
            return [...problems, `${at} must be of type ${types.join(" or ")}`];
        }
    }

    if ("const" in schema && canonical(value) !== canonical(schema.const)) {
        problems.push(`${at} must be ${JSON.stringify(schema.const)}`);
    }

    if (
        Array.isArray(schema.enum) &&
        !schema.enum.some((each) => canonical(each) === canonical(value))
    ) {
        problems.push(
            `${at} must be one of ${schema.enum.map((each) => JSON.stringify(each)).join(", ")}`,
        );
    }

    if (typeof value === "string") {
        // JSON Schema counts characters as code points.
        const length = [...value].length;

        if (typeof schema.minLength === "number" && length < schema.minLength) {
            problems.push(`${at} must have ${schema.minLength} characters or more`);
        }

        if (typeof schema.maxLength === "number" && length > schema.maxLength) {
            problems.push(`${at} must have ${schema.maxLength} characters or fewer`);
        }

        if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
            problems.push(`${at} is not in the correct form: ${JSON.stringify(value)}`);
        }
    }

    if (typeof value === "number") {
        if (typeof schema.minimum === "number" && value < schema.minimum) {
            problems.push(`${at} must be ${schema.minimum} or more`);
        }

        if (typeof schema.maximum === "number" && value > schema.maximum) {
            problems.push(`${at} must be ${schema.maximum} or less`);
        }
    }

    if (Array.isArray(value)) {
        if (typeof schema.minItems === "number" && value.length < schema.minItems) {
            problems.push(`${at} must have ${schema.minItems} items or more`);
        }

        if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
            problems.push(`${at} must have ${schema.maxItems} items or fewer`);
        }

        if (schema.uniqueItems === true) {
            const texts = value.map(canonical);

            if (new Set(texts).size !== texts.length) {
                problems.push(`${at} must not have the same item two times`);
            }
        }

        if (typeof schema.items === "object" && schema.items !== null) {
            value.forEach((item, index) => {
                problems.push(
                    ...check(item, schema.items as Schema, schemas, `${where}[${index}]`, root),
                );
            });
        }
    }

    if (typeOf(value) === "object") {
        const object = value as Schema;
        const properties = (schema.properties ?? {}) as Record<string, Schema>;
        const field = (key: string) => (where === "" ? key : `${where}.${key}`);

        for (const key of (schema.required ?? []) as string[]) {
            if (!(key in object)) {
                problems.push(`${field(key)} is missing`);
            }
        }

        for (const [key, item] of Object.entries(object)) {
            if (key in properties) {
                problems.push(...check(item, properties[key]!, schemas, field(key), root));
            } else if (schema.additionalProperties === false) {
                problems.push(`${field(key)} is not a known field`);
            } else if (typeof schema.additionalProperties === "object") {
                problems.push(
                    ...check(
                        item,
                        schema.additionalProperties as Schema,
                        schemas,
                        field(key),
                        root,
                    ),
                );
            }
        }
    }

    return problems;
}
