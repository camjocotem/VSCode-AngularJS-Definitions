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
import { getPositionFromOffset, getWordAt, kebabCaseToCamelCase } from './helpers';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const memCache = { uris: [] as string[], pathsToExclude: [] as string[], requestTracker: {} as { [key: string]: boolean } };

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
		if (!uri.endsWith('.js')) {
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
const definitionCache: Map<string, Definition | undefined> = new Map();


connection.onDefinition(async (params: TextDocumentPositionParams): Promise<Definition | undefined> => {
	const documentUri = params.textDocument.uri;
	const positionStr = `${params.position.line}:${params.position.character}`;
	const cacheKey = `${documentUri}:${positionStr}`;

	if (definitionCache.has(cacheKey)) {
		memCache.requestTracker[cacheKey] = false;
		return definitionCache.get(cacheKey);
	}

	if (memCache.requestTracker[cacheKey]) {
		return undefined;
	}

	memCache.requestTracker[cacheKey] = true;

	const document = documents.get(documentUri);
	if (!document) {
		memCache.requestTracker[cacheKey] = false;
		return undefined;
	}

	const word = getWordAt(document, params.position);
	const componentName = kebabCaseToCamelCase(word);
	const definition = componentsMapCache?.get(componentName);

	if (!definition) {
		let componentsMapCache = undefined;
		componentsMapCache = await parseJsFiles(memCache.uris);

		const newDefinition = componentsMapCache?.get(componentName);

		definitionCache.set(cacheKey, newDefinition);
		memCache.requestTracker[cacheKey] = false;
		return newDefinition;
	}

	definitionCache.set(cacheKey, definition);
	memCache.requestTracker[cacheKey] = false;
	return definition;
});

connection.onNotification('setFileList', async (uris: string[]) => {
	memCache.uris = uris;
	componentsMapCache = await parseJsFiles(memCache.uris);
});

documents.onDidSave(async (params) => {
	if (!memCache.uris.includes(params.document.uri) && params.document.uri.endsWith('.js')) {
		memCache.uris.push(params.document.uri);
	}
	componentsMapCache = await parseJsFiles([params.document.uri]);
});

connection.onNotification('fileChange', async (uri: string) => {
	definitionCache.delete(uri)
});

documents.listen(connection);
connection.listen();
