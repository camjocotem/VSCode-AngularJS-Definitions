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
import GoDefinitionProvider from './GoDefinitionProvider';

let client: LanguageClient;
const eventListenerDisposables: vscode.Disposable[] = [];

const GetFileContentRequest = new RequestType<string, string, void>('getFileContent');
const fsWatcher = vscode.workspace.createFileSystemWatcher('**/*.{html,js}');
eventListenerDisposables.push(fsWatcher);

const goDefinitionProvider = new GoDefinitionProvider(client);
const defProv = vscode.languages.registerDefinitionProvider({ language: 'html', scheme: 'file', pattern: '**/*html*' }, goDefinitionProvider);
eventListenerDisposables.push(defProv);

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
    documentSelector: [
      { language: 'html', scheme: 'file' },
      { language: "javascript", scheme: "file" }
    ],
    synchronize: {
      fileEvents: fsWatcher
    },
  };

  // Create the language client and start the client
  client = new LanguageClient("angularJSGoToDefProvider", "AngularJS Definition Provider", serverOptions, clientOptions);

  client.onRequest(GetFileContentRequest, async (uri: string) => {
    try {
      const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
      return new TextDecoder().decode(fileContent);
    } catch (error) {
      return undefined;
    }
  });

  // Register the event listeners and store the disposables
  eventListenerDisposables.push(
    vscode.workspace.onDidDeleteFiles((e) => {
      refreshPathMappings();
    }),
    vscode.workspace.onDidRenameFiles((e) => {
      refreshPathMappings();
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      // refreshPathMappings();      
      client.sendNotification('fileChange', e.document.uri.toString());
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if(e.affectsConfiguration('pathsToExclude')){
        refreshPathMappings();
      }
    })
  );

  client.start().then(() => {
    refreshPathMappings();
    context.subscriptions.push(defProv, ...eventListenerDisposables);
  });
}

function refreshPathMappings(){
  vscode.workspace.findFiles('**/*.js', '**/node_modules/**')
  .then((jsFiles:vscode.Uri[]) => {
    let jsFileUris = jsFiles.map(file => file.toString());      
    const config = vscode.workspace.getConfiguration('angularJSGoToDefProvider');
    const res: string[] = config.get('pathsToExclude');    

    if(res.length > 0){
      const excludePatterns = res.map(str => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')).join('|');
      const regex = new RegExp(`^(?!.*(${excludePatterns})).*\\.js$`, 'i');
      
      jsFileUris = jsFileUris.filter(uri => regex.test(uri));      
    }
    else{
      jsFileUris.filter(uri => uri.endsWith('.js'));
    }

    client.sendNotification('setFileList', jsFileUris);
  });
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }

  eventListenerDisposables.forEach((disposable) => {
    if(disposable){
      disposable.dispose();
    }
  });

  // Stop the language client
  return client.stop();
}