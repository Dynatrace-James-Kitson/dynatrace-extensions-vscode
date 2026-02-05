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
 * LANGUAGE MODEL TOOL FOR DYNATRACE EXTENSION SCHEMAS
 * 
 * This tool exposes Dynatrace extension schemas to VS Code's Language Model API,
 * allowing Copilot and Chat participants to reference schema constraints when
 * generating extension code.
 * 
 * Note: The Language Model Tool API is available in VS Code 1.90.0+. This extension
 * requires @types/vscode to be updated to include these types. In the meantime,
 * we use type assertions to work around the missing type definitions.
 ********************************************************************************/

import vscode from "vscode";
import logger from "../utils/logging";
import { formatSchemasForLLM } from "./schemaFormatter";
import { loadSchemas, NoExtensionWorkspaceError, NoSchemaVersionError } from "./schemaLoader";

const logTrace = ["languageModel", "extensionSchemasTool"];

const TOOL_ID = "dynatrace_extension_schemas";

// Type definitions for Language Model Tool API (these will be in @types/vscode soon)
interface LanguageModelToolInvocationPrepareOptions<T> {
  input: T;
}

interface LanguageModelToolInvocationOptions<T> {
  input: T;
  toolInvocationToken: unknown;
  tokenizationOptions?: unknown;
}

interface PreparedToolInvocation {
  invocationMessage?: string;
}

interface LanguageModelTool<T = unknown> {
  prepareInvocation?(
    options: LanguageModelToolInvocationPrepareOptions<T>,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<PreparedToolInvocation>;
  invoke(
    options: LanguageModelToolInvocationOptions<T>,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<unknown>;
}

// Extend vscode namespace for Language Model API
declare module "vscode" {
  export class LanguageModelToolResult {
    constructor(content: unknown[]);
  }
  export class LanguageModelTextPart {
    constructor(value: string);
  }
  namespace lm {
    function registerTool<T>(name: string, tool: LanguageModelTool<T>): vscode.Disposable;
  }
}

/**
 * Registers the Dynatrace Extension Schemas language model tool.
 * This tool provides schema information to language models for generating valid extension code.
 * @param context the extension context
 * @returns the disposable for the registered tool
 */
export function registerExtensionSchemasTool(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  const fnLogTrace = [...logTrace, "registerExtensionSchemasTool"];

  logger.info("Registering Dynatrace Extension Schemas language model tool", ...fnLogTrace);

  const tool: LanguageModelTool<Record<string, never>> = {
    prepareInvocation: async (
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _options: LanguageModelToolInvocationPrepareOptions<Record<string, never>>,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _token: vscode.CancellationToken,
    ) => {
      return {
        invocationMessage: "Accessing Dynatrace extension schemas",
      };
    },
    invoke: async (
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _options: LanguageModelToolInvocationOptions<Record<string, never>>,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _token: vscode.CancellationToken,
    ) => {
      const fnInvokeLogTrace = [...logTrace, "invoke"];

      try {
        logger.info("========================================", ...fnInvokeLogTrace);
        logger.info("Language model tool INVOKED", ...fnInvokeLogTrace);
        logger.info("========================================", ...fnInvokeLogTrace);

        // Load schemas for the current workspace
        const { extensionSchema, activationSchema, datasourceType } = loadSchemas(
          context.extensionPath,
        );

        logger.info(
          `✓ Loaded schemas for datasource type: ${datasourceType}`,
          ...fnInvokeLogTrace,
        );
        logger.info(
          `✓ Extension schema size: ${JSON.stringify(extensionSchema).length} bytes`,
          ...fnInvokeLogTrace,
        );
        logger.info(
          `✓ Activation schema ${activationSchema ? "loaded" : "not available"}`,
          ...fnInvokeLogTrace,
        );

        // Format schemas for LLM consumption
        const formattedSchemas = formatSchemasForLLM(
          extensionSchema,
          activationSchema,
          datasourceType,
        );

        logger.info(
          `✓ Formatted schema information: ${formattedSchemas.length} characters`,
          ...fnInvokeLogTrace,
        );
        
        // Log first 500 characters to verify content
        logger.info(
          `Preview: ${formattedSchemas.substring(0, 500)}...`,
          ...fnInvokeLogTrace,
        );

        // Return as LanguageModelToolResult
        const result = new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(formattedSchemas),
        ]);
        
        logger.info("✓ Created LanguageModelToolResult", ...fnInvokeLogTrace);
        logger.info("========================================", ...fnInvokeLogTrace);

        return result;
      } catch (err) {
        const error = err as Error;
        logger.error("========================================", ...fnInvokeLogTrace);
        logger.error(`❌ Tool invocation FAILED: ${error.message}`, ...fnInvokeLogTrace);
        logger.error(`Stack: ${error.stack}`, ...fnInvokeLogTrace);
        logger.error("========================================", ...fnInvokeLogTrace);

        // Provide helpful error messages based on error type
        let errorMessage = `Failed to load Dynatrace extension schemas: ${error.message}`;

        if (error instanceof NoExtensionWorkspaceError) {
          errorMessage =
            "No Dynatrace extension workspace is active. " +
            "The user needs to run the 'Dynatrace extensions: Initialize workspace' command first to set up an extension workspace.";
        } else if (error instanceof NoSchemaVersionError) {
          errorMessage =
            "No extension schema version has been loaded. " +
            "The user needs to run the 'Dynatrace extensions: Load schemas' command to download the latest schema files.";
        }

        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(errorMessage),
        ]);
      }
    },
  };

  // Use type assertion to work around missing types in @types/vscode
  const disposable = (vscode.lm as { registerTool: <T>(name: string, tool: LanguageModelTool<T>) => vscode.Disposable }).registerTool(TOOL_ID, tool);

  logger.info("Dynatrace Extension Schemas language model tool registered", ...fnLogTrace);

  return disposable;
}
