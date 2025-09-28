// Schema validation utilities for work inputs and outputs
import { JSONSchema7 } from "json-schema";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

export class SchemaValidator {
  private static instance: SchemaValidator;
  private validators = new Map<string, Ajv.ValidateFunction>();

  static getInstance(): SchemaValidator {
    if (!SchemaValidator.instance) {
      SchemaValidator.instance = new SchemaValidator();
    }
    return SchemaValidator.instance;
  }

  validateInput<T>(schema: JSONSchema7, data: unknown): data is T {
    const schemaKey = JSON.stringify(schema);
    
    if (!this.validators.has(schemaKey)) {
      const validate = ajv.compile(schema);
      this.validators.set(schemaKey, validate);
    }

    const validate = this.validators.get(schemaKey)!;
    const isValid = validate(data);
    
    if (!isValid) {
      console.error("Schema validation failed:", validate.errors);
    }
    
    return isValid;
  }

  validateOutput<T>(schema: JSONSchema7, data: unknown): data is T {
    return this.validateInput<T>(schema, data);
  }
}

export const schemaValidator = SchemaValidator.getInstance();
