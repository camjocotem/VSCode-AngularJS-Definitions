/* eslint-disable no-mixed-spaces-and-tabs */
import {
	createConnection,
	ProposedFeatures,
	TextDocuments,
	TextDocumentPositionParams,
	InitializeParams,
	InitializeResult,
	Definition,
} from "vscode-languageserver/node";
import { RequestType } from 'vscode-jsonrpc';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getPositionFromOffset, getWordAt } from './helpers';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const memCache = { uris: [] as string[], pathsToExclude: [] as string[] };

function kebabCaseToCamelCase(str: string): string {
	return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
	console.log("onInitialize", params);
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
	const word = getWordAt(document, params.position);
	const componentName = kebabCaseToCamelCase(word);
	const definition = componentsMapCache?.get(componentName);

	if(!definition){
		componentsMapCache = await parseJsFiles(memCache.uris);
		return componentsMapCache?.get(componentName);
	}

	return definition;
});

connection.onNotification('initialFileList', async (uris: string[]) => {
	memCache.uris = uris.filter(uri => uri.endsWith('.js') && !memCache.pathsToExclude.some(str => uri.includes(str)));
	if (componentsMapCache.size === 0) {
		componentsMapCache = await parseJsFiles(memCache.uris);
	}
});

connection.onNotification('pathsToExcludeUpdated', async (pathsToExclude: string[]) => {
	memCache.pathsToExclude = pathsToExclude;
});

connection.onNotification('fileDeleted', async (uri: string) => {
	memCache.uris = memCache.uris.filter(u => u !== uri);
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
