/* eslint-disable no-mixed-spaces-and-tabs */
import {
	createConnection,
	ProposedFeatures,
	TextDocuments,
	TextDocumentPositionParams,
	InitializeParams,
	InitializeResult,
	Definition,
	DidChangeTextDocumentParams,
	DidSaveTextDocumentParams
} from "vscode-languageserver/node";
import { RequestType } from 'vscode-jsonrpc';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getPositionFromOffset, getWordAt } from './helpers';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const memCache = { uris: [] as string[] };

function kebabCaseToCamelCase(str: string): string {
	return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
	return {
		capabilities: {
			definitionProvider: true
		},
	};
});

const GetFileContentRequest = new RequestType<string, string, void>('getFileContent');

async function parseJsFiles(uris: string[]): Promise<Map<string, Definition>> {
	const componentsMap = componentsMapCache || new Map<string, Definition>();

	for (const uri of uris) {
		if(!uri.endsWith('.js')) {
			continue;
		}
		const fileContent = await connection.sendRequest(GetFileContentRequest, uri);
		if (!fileContent) {
			continue;
		}

		const regex = /(?:\.directive|\.component)\(\s*['"]([^'"]+)['"]/g;
		let match;
		while ((match = regex.exec(fileContent)) !== null) {
			const componentName = match[1];
			const position = getPositionFromOffset(fileContent, match.index);
			const definition: Definition = { uri, range: { start: position, end: position } };

			componentsMap.set(componentName, definition);
		}
	}

	return componentsMap;
}

let componentsMapCache: Map<string, Definition> = new Map<string, Definition>();

connection.onDefinition(async (params: TextDocumentPositionParams): Promise<Definition | undefined> => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return undefined;
	}

	// Get the word under the cursor
	const word = getWordAt(document, params.position);

	// Convert the word to camelCase and find the corresponding definition in the componentsMap
	const componentName = kebabCaseToCamelCase(word);

	const definition = componentsMapCache?.get(componentName);

	if(!definition){
		// If the definition is not found, update the cache and try again
		componentsMapCache = await parseJsFiles(memCache.uris);
		return componentsMapCache?.get(componentName);
	}


	return definition;
});

connection.onDidChangeTextDocument(async (params: DidChangeTextDocumentParams) : Promise<void> => {
	// Update the cache if a JavaScript file changes
	console.log("onDidChangeTextDocument", params);
});

connection.onDidSaveTextDocument(async (params: DidSaveTextDocumentParams) : Promise<void> => {
	// Update the cache if a JavaScript file changes
	console.log("onDidSaveTextDocument", params);
});

connection.onNotification('initialFileList', async (uris: string[]) => {
	const fileStringsToExclude = [
		'/node_modules/',
		'/dist/',
		'/build/',
		'/coverage/',
		'/test/',
		'/tests/',
		'/spec/',
		'/specs/',
		'/e2e/',
		'/mock/',
		'/mocks/',
		'/lib/'
	];

	memCache.uris = uris.filter(uri => uri.endsWith('.js') && !fileStringsToExclude.some(str => uri.includes(str)));
	if (componentsMapCache.size === 0) {
		componentsMapCache = await parseJsFiles(memCache.uris);
	}
});

connection.onNotification('fileDeleted', async (uri: string) => {
	memCache.uris = memCache.uris.filter(u => u !== uri);
	//This is a bit of a hack
	if (memCache.uris.length > 0) {
		componentsMapCache = await parseJsFiles(memCache.uris);
	}
});

connection.onNotification('fileRenamed', async (uris: { old:string, new:string}) => {
	memCache.uris = memCache.uris.map(u => u === uris.old ? uris.new : u);
});

documents.onDidSave(async(params) => {
	if(!memCache.uris.includes(params.document.uri) && params.document.uri.endsWith('.js')){
		memCache.uris.push(params.document.uri);
	}
	componentsMapCache = await parseJsFiles([params.document.uri]);
});

documents.listen(connection);
connection.listen();
