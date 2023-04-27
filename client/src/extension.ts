import * as path from "path";
import { TextDecoder } from 'util';
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  RequestType,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

vscode.workspace.findFiles('**/*.js', '**/node_modules/**').then(jsFiles => {
  const jsFileUris = jsFiles.map(file => file.toString());
  client.sendNotification('parseJsFiles', jsFileUris);
});

const GetFileContentRequest = new RequestType<string, string, void>('getFileContent');


// New class for the definition provider
class GoDefinitionProvider implements vscode.DefinitionProvider {
  private client: LanguageClient;

  constructor(client: LanguageClient) {
    this.client = client;
  }

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | undefined> {
    const params = this.client.code2ProtocolConverter.asTextDocumentPositionParams(document, position);
    const definition = await this.client.sendRequest('textDocument/definition', params, token);

    if (!definition) {
      return undefined;
    }

    // return this.client.protocol2CodeConverter.asDefinitionResult(definition);
  }
}

function kebabCaseToCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

function camelCaseToKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

export function activate(context: vscode.ExtensionContext) {
  // The server is implemented in the server.ts file
  const serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));

  // The debug options for the server
  const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

  // If the extension is launched in debug mode, then the debug server options are used
  // Otherwise, the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: 'html', scheme: 'file' }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{html,js}'),
    },
  };

  // Create the language client and start the client
  client = new LanguageClient("angularJSDefinitionProvider", "AngularJS Definition Provider", serverOptions, clientOptions);

  client.onRequest(GetFileContentRequest, async (uri: string) => {
    try {
      const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
      return new TextDecoder().decode(fileContent);
    } catch (error) {
      console.error(`Error reading file content for URI: ${uri}`, error);
      return undefined;
    }
  });

  client.start().then(() => {
    const goDefinitionProvider = new GoDefinitionProvider(client);
    context.subscriptions.push(
      vscode.languages.registerDefinitionProvider({ language: 'html', scheme: 'file', pattern: '**/*html*' }, goDefinitionProvider)
    );
  });
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }

  // Stop the language client
  return client.stop();
}