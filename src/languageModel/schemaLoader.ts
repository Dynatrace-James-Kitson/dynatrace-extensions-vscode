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
 * UTILITIES FOR LOADING EXTENSION AND ACTIVATION SCHEMAS
 ********************************************************************************/

import { existsSync, readFileSync } from "fs";
import path from "path";
import { getActivationContext } from "../extension";
import { DatasourceName } from "../interfaces/extensionMeta";
import { getCachedParsedExtension } from "../utils/caching";
import { getDatasourceName } from "../utils/extensionParsing";
import { getExtensionFilePath } from "../utils/fileSystem";
import logger from "../utils/logging";

const logTrace = ["languageModel", "schemaLoader"];

/**
 * Error thrown when no extension.yaml exists in the workspace.
 */
export class NoExtensionWorkspaceError extends Error {
  constructor() {
    super(
      "No Dynatrace extension workspace is active. Please run 'Initialize Extension Workspace' command first.",
    );
    this.name = "NoExtensionWorkspaceError";
  }
}

/**
 * Error thrown when no schema version has been loaded.
 */
export class NoSchemaVersionError extends Error {
  constructor() {
    super("No schema version loaded. Please run 'Load Schemas' command first.");
    this.name = "NoSchemaVersionError";
  }
}

/**
 * Loads the extension schema from global storage.
 * The schema file is downloaded via "Load Schemas" command and stored in
 * {globalStorage}/{version}/extension.schema.json
 * @returns the extension schema as a JSON object
 * @throws NoSchemaVersionError if no schema version has been loaded
 */
export function loadExtensionSchema(): Record<string, unknown> {
  const fnLogTrace = [...logTrace, "loadExtensionSchema"];
  const context = getActivationContext();

  // Get the schema version from workspace state
  const schemaVersion = context.workspaceState.get<string>("schemaVersion");
  if (!schemaVersion) {
    logger.error("No schema version found in workspace state", ...fnLogTrace);
    throw new NoSchemaVersionError();
  }

  // Build path to extension schema
  const schemaPath = path.join(
    context.globalStorageUri.fsPath,
    schemaVersion,
    "extension.schema.json",
  );

  if (!existsSync(schemaPath)) {
    logger.error(`Extension schema not found at ${schemaPath}`, ...fnLogTrace);
    throw new NoSchemaVersionError();
  }

  try {
    const schemaContent = readFileSync(schemaPath, "utf-8");
    return JSON.parse(schemaContent) as Record<string, unknown>;
  } catch (err) {
    logger.error(`Failed to load extension schema: ${(err as Error).message}`, ...fnLogTrace);
    throw err;
  }
}

/**
 * Gets the datasource type for the current workspace's extension.
 * @returns the datasource name
 * @throws NoExtensionWorkspaceError if no extension.yaml exists
 */
export function getCurrentDatasourceType(): DatasourceName {
  const fnLogTrace = [...logTrace, "getCurrentDatasourceType"];

  // Get the parsed extension from cache
  const parsedExtension = getCachedParsedExtension();

  if (!parsedExtension) {
    logger.error("No parsed extension found in cache", ...fnLogTrace);
    throw new NoExtensionWorkspaceError();
  }

  // Determine datasource type
  const datasourceName = getDatasourceName(parsedExtension);

  if (datasourceName === "unsupported") {
    logger.warn("Extension has unsupported datasource type", ...fnLogTrace);
  }

  return datasourceName;
}

/**
 * Loads the activation schema for a specific datasource type.
 * For most datasources, this loads from src/assets/jsonSchemas/{datasource}-generic-schema.json
 * For Python extensions, this loads from the workspace's activationSchema.json file.
 * @param datasourceName the datasource type
 * @param extensionPath the path to the extension root directory (needed for resolving relative paths)
 * @returns the activation schema as a JSON object, or null if datasource is unsupported or schema doesn't exist
 */
export function loadActivationSchema(
  datasourceName: DatasourceName,
  extensionPath: string,
): Record<string, unknown> | null {
  const fnLogTrace = [...logTrace, "loadActivationSchema"];

  if (datasourceName === "unsupported") {
    logger.warn("Cannot load activation schema for unsupported datasource", ...fnLogTrace);
    return null;
  }

  let schemaPath: string;

  // Python extensions use activationSchema.json from the workspace
  if (datasourceName === "python") {
    const extensionFilePath = getExtensionFilePath();
    if (!extensionFilePath) {
      logger.error("Cannot determine extension file path", ...fnLogTrace);
      throw new NoExtensionWorkspaceError();
    }
    const extensionDir = path.dirname(extensionFilePath);
    schemaPath = path.join(extensionDir, "activationSchema.json");
  } else {
    // Other datasources use bundled generic schemas
    // Map datasource name to schema filename (e.g., "sqlDb2" -> "sqldb2-generic-schema.json")
    const schemaFileName = `${datasourceName.toLowerCase()}-generic-schema.json`;
    schemaPath = path.join(extensionPath, "src", "assets", "jsonSchemas", schemaFileName);
  }

  if (!existsSync(schemaPath)) {
    logger.warn(`Activation schema not found at ${schemaPath}`, ...fnLogTrace);
    return null;
  }

  try {
    const schemaContent = readFileSync(schemaPath, "utf-8");
    return JSON.parse(schemaContent) as Record<string, unknown>;
  } catch (err) {
    logger.error(`Failed to load activation schema: ${(err as Error).message}`, ...fnLogTrace);
    throw err;
  }
}

/**
 * Loads all relevant schemas for the current workspace.
 * @param extensionPath the path to the extension root directory
 * @returns an object containing the extension schema and activation schema (if available)
 * @throws NoExtensionWorkspaceError if no extension workspace is active
 * @throws NoSchemaVersionError if no schema version has been loaded
 */
export function loadSchemas(extensionPath: string): {
  extensionSchema: Record<string, unknown>;
  activationSchema: Record<string, unknown> | null;
  datasourceType: DatasourceName;
} {
  const fnLogTrace = [...logTrace, "loadSchemas"];

  logger.debug("Loading schemas for language model tool", ...fnLogTrace);

  const extensionSchema = loadExtensionSchema();
  const datasourceType = getCurrentDatasourceType();
  const activationSchema = loadActivationSchema(datasourceType, extensionPath);

  logger.debug(
    `Loaded schemas: extension=${!!extensionSchema}, activation=${!!activationSchema}, datasource=${datasourceType}`,
    ...fnLogTrace,
  );

  return {
    extensionSchema,
    activationSchema,
    datasourceType,
  };
}
