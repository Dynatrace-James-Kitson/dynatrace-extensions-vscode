/**
  Copyright 2022 Dynatrace LLC

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 */

/********************************************************************************
 * UTILITIES FOR FORMATTING SCHEMAS FOR LANGUAGE MODEL CONSUMPTION
 ********************************************************************************/

import { DatasourceName } from "../interfaces/extensionMeta";

interface SchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  examples?: unknown[];
  [key: string]: unknown;
}

/**
 * Extracts enum values and their descriptions from a schema property.
 * @param property the schema property to extract enums from
 * @param propertyPath the path to this property (for documentation)
 * @returns array of enum information
 */
function extractEnums(
  property: SchemaProperty,
  propertyPath: string,
): Array<{ path: string; values: unknown[]; description?: string }> {
  const enums: Array<{ path: string; values: unknown[]; description?: string }> = [];

  if (property.enum) {
    enums.push({
      path: propertyPath,
      values: property.enum,
      description: property.description,
    });
  }

  // Recursively check nested properties
  if (property.properties) {
    for (const [key, nestedProperty] of Object.entries(property.properties)) {
      enums.push(...extractEnums(nestedProperty, `${propertyPath}.${key}`));
    }
  }

  // Check array items
  if (property.items) {
    enums.push(...extractEnums(property.items, `${propertyPath}[]`));
  }

  return enums;
}

/**
 * Extracts constraint information from a schema property.
 * @param property the schema property to extract constraints from
 * @param propertyPath the path to this property
 * @returns array of constraint information
 */
function extractConstraints(
  property: SchemaProperty,
  propertyPath: string,
): Array<{ path: string; type: string; constraints: Record<string, unknown> }> {
  const constraints: Array<{ path: string; type: string; constraints: Record<string, unknown> }> =
    [];
  const constraintInfo: Record<string, unknown> = {};

  // String constraints
  if (property.pattern) {
    constraintInfo.pattern = property.pattern;
  }
  if (property.minLength !== undefined) {
    constraintInfo.minLength = property.minLength;
  }
  if (property.maxLength !== undefined) {
    constraintInfo.maxLength = property.maxLength;
  }

  // Number constraints
  if (property.minimum !== undefined) {
    constraintInfo.minimum = property.minimum;
  }
  if (property.maximum !== undefined) {
    constraintInfo.maximum = property.maximum;
  }

  if (Object.keys(constraintInfo).length > 0) {
    constraints.push({
      path: propertyPath,
      type: Array.isArray(property.type) ? property.type.join("|") : property.type || "unknown",
      constraints: constraintInfo,
    });
  }

  // Recursively check nested properties
  if (property.properties) {
    for (const [key, nestedProperty] of Object.entries(property.properties)) {
      constraints.push(...extractConstraints(nestedProperty, `${propertyPath}.${key}`));
    }
  }

  // Check array items
  if (property.items) {
    constraints.push(...extractConstraints(property.items, `${propertyPath}[]`));
  }

  return constraints;
}

/**
 * Extracts required fields from a schema.
 * @param schema the schema to extract required fields from
 * @param parentPath the parent path for nested properties
 * @returns array of required field paths
 */
function extractRequiredFields(
  schema: SchemaProperty,
  parentPath: string = "",
): Array<{ path: string; description?: string }> {
  const requiredFields: Array<{ path: string; description?: string }> = [];

  if (schema.required && schema.properties) {
    for (const fieldName of schema.required) {
      const fieldPath = parentPath ? `${parentPath}.${fieldName}` : fieldName;
      const property = schema.properties[fieldName];
      requiredFields.push({
        path: fieldPath,
        description: property?.description,
      });

      // Recursively check nested required fields
      if (property?.properties) {
        requiredFields.push(...extractRequiredFields(property, fieldPath));
      }
    }
  }

  // Check nested properties even if not required
  if (schema.properties) {
    for (const [key, property] of Object.entries(schema.properties)) {
      if (property.properties && !schema.required?.includes(key)) {
        const fieldPath = parentPath ? `${parentPath}.${key}` : key;
        requiredFields.push(...extractRequiredFields(property, fieldPath));
      }
    }
  }

  return requiredFields;
}

/**
 * Creates example YAML snippets based on datasource type.
 * @param datasourceType the type of datasource
 * @returns example YAML snippets
 */
function createExampleSnippets(datasourceType: DatasourceName): string {
  const examples: Record<DatasourceName, string> = {
    prometheus: `# Example Prometheus Extension Structure
name: custom:my-prometheus-extension
version: "1.0.0"
minDynatraceVersion: "1.267.0"
author:
  name: "Your Name"

prometheus:
  - group: my_metrics
    interval: 1m
    subgroups:
      - subgroup: server_metrics
        metrics:
          - key: my_metric
            value: metric:prometheus_metric_name
            type: gauge

metrics:
  - key: my_metric
    metadata:
      displayName: My Metric
      description: Description of metric
      unit: Count`,

    snmp: `# Example SNMP Extension Structure
name: custom:my-snmp-extension
version: "1.0.0"
minDynatraceVersion: "1.267.0"
author:
  name: "Your Name"

snmp:
  - group: network_metrics
    interval: 1m
    dimensions:
      - key: interface_name
        value: oid:1.3.6.1.2.1.2.2.1.2
    subgroups:
      - subgroup: interface_stats
        table: true
        metrics:
          - key: if_in_octets
            value: oid:1.3.6.1.2.1.2.2.1.10
            type: count

metrics:
  - key: if_in_octets
    metadata:
      displayName: Interface Inbound Octets
      description: Number of octets received
      unit: Byte`,

    wmi: `# Example WMI Extension Structure
name: custom:my-wmi-extension
version: "1.0.0"
minDynatraceVersion: "1.267.0"
author:
  name: "Your Name"

wmi:
  - group: system_metrics
    interval: 1m
    subgroups:
      - subgroup: cpu_usage
        query: SELECT Name, PercentProcessorTime FROM Win32_PerfFormattedData_PerfOS_Processor
        metrics:
          - key: cpu_time
            value: column:PercentProcessorTime
            type: gauge

metrics:
  - key: cpu_time
    metadata:
      displayName: CPU Time
      description: Processor time percentage
      unit: Percent`,

    python: `# Example Python Extension Structure
name: custom:my-python-extension
version: "1.0.0"
minDynatraceVersion: "1.267.0"
author:
  name: "Your Name"

python:
  runtime:
    module: extension
    version:
      min: "3.10"

metrics:
  - key: my_custom_metric
    metadata:
      displayName: My Custom Metric
      description: Custom metric from Python
      unit: Count`,

    sqlDb2: `# Example SQL DB2 Extension Structure
name: custom:my-db2-extension
version: "1.0.0"
minDynatraceVersion: "1.267.0"

sqlDb2:
  - group: database_metrics
    interval: 1m
    subgroups:
      - subgroup: table_stats
        query: SELECT * FROM SYSCAT.TABLES
        metrics:
          - key: table_count
            value: column:COUNT
            type: gauge`,

    sqlHana: `# Example SQL HANA Extension`,
    sqlMySql: `# Example SQL MySQL Extension`,
    sqlOracle: `# Example SQL Oracle Extension`,
    sqlPostgres: `# Example SQL PostgreSQL Extension`,
    sqlServer: `# Example SQL Server Extension`,
    sqlSnowflake: `# Example SQL Snowflake Extension`,
    unsupported: `# No examples available for unsupported datasource type`,
  };

  return examples[datasourceType] || examples.unsupported;
}

/**
 * Formats schemas for language model consumption.
 * Creates a structured text output containing schema definitions, constraints, enums, and examples.
 * @param extensionSchema the extension schema (extension.yaml structure)
 * @param activationSchema the activation schema (monitoring configuration structure)
 * @param datasourceType the type of datasource
 * @returns formatted schema documentation string
 */
export function formatSchemasForLLM(
  extensionSchema: Record<string, unknown>,
  activationSchema: Record<string, unknown> | null,
  datasourceType: DatasourceName,
): string {
  const sections: string[] = [];

  // Header
  sections.push("# Dynatrace Extension Schemas");
  sections.push("");
  sections.push(
    `This document contains the complete schema definitions for creating Dynatrace extensions with datasource type: ${datasourceType}`,
  );
  sections.push("");

  // Extension Schema
  sections.push("## Extension Schema (extension.yaml)");
  sections.push("");
  sections.push("This schema defines the structure of the extension.yaml file.");
  sections.push("");
  sections.push("### Full Extension Schema");
  sections.push("```json");
  sections.push(JSON.stringify(extensionSchema, null, 2));
  sections.push("```");
  sections.push("");

  // Extract and document required fields from extension schema
  const extensionRequiredFields = extractRequiredFields(extensionSchema as SchemaProperty);
  if (extensionRequiredFields.length > 0) {
    sections.push("### Required Fields (Extension)");
    sections.push("");
    for (const field of extensionRequiredFields) {
      sections.push(`- **${field.path}**${field.description ? `: ${field.description}` : ""}`);
    }
    sections.push("");
  }

  // Activation Schema (if available)
  if (activationSchema) {
    sections.push(`## Activation Schema (${datasourceType} Monitoring Configuration)`);
    sections.push("");
    sections.push(
      "This schema defines the structure of monitoring configurations (activation.json) for this datasource type.",
    );
    sections.push("");
    sections.push("### Full Activation Schema");
    sections.push("```json");
    sections.push(JSON.stringify(activationSchema, null, 2));
    sections.push("```");
    sections.push("");

    // Extract enums
    const enums = extractEnums(activationSchema as SchemaProperty, "root");
    if (enums.length > 0) {
      sections.push("### Available Enum Values");
      sections.push("");
      for (const enumInfo of enums) {
        sections.push(`**${enumInfo.path}**`);
        if (enumInfo.description) {
          sections.push(`- Description: ${enumInfo.description}`);
        }
        sections.push(`- Values: ${enumInfo.values.map(v => `\`${v}\``).join(", ")}`);
        sections.push("");
      }
    }

    // Extract constraints
    const constraints = extractConstraints(activationSchema as SchemaProperty, "root");
    if (constraints.length > 0) {
      sections.push("### Property Constraints");
      sections.push("");
      for (const constraint of constraints) {
        sections.push(`**${constraint.path}** (${constraint.type})`);
        for (const [key, value] of Object.entries(constraint.constraints)) {
          sections.push(`- ${key}: ${value}`);
        }
        sections.push("");
      }
    }

    // Extract required fields
    const activationRequiredFields = extractRequiredFields(activationSchema as SchemaProperty);
    if (activationRequiredFields.length > 0) {
      sections.push("### Required Fields (Activation)");
      sections.push("");
      for (const field of activationRequiredFields) {
        sections.push(`- **${field.path}**${field.description ? `: ${field.description}` : ""}`);
      }
      sections.push("");
    }
  }

  // Add example snippets
  sections.push("## Example Extension Structure");
  sections.push("");
  sections.push("```yaml");
  sections.push(createExampleSnippets(datasourceType));
  sections.push("```");
  sections.push("");

  // Additional guidance
  sections.push("## Key Concepts");
  sections.push("");
  sections.push("- **Metrics**: Define the data points collected by the extension");
  sections.push(
    "- **Dimensions**: Attributes that provide context for metrics (e.g., host name, interface name)",
  );
  sections.push("- **Topology**: Entity types and relationships for custom entities");
  sections.push("- **Screens**: UI definitions for displaying extension data");
  sections.push(
    "- **Activation Schema**: Configuration schema for monitoring configurations that use this extension",
  );
  sections.push("");

  return sections.join("\n");
}
