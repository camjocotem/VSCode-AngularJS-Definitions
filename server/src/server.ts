/* eslint-disable no-mixed-spaces-and-tabs */
import {
	createConnection,
	ProposedFeatures,
	TextDocuments,
	TextDocumentPositionParams,
	InitializeParams,
	InitializeResult,
	Definition	
  } from "vscode-languageserver/node";
  import { RequestType } from 'vscode-jsonrpc';

  
  import * as babelParser from "@babel/parser";
  import {
	  Position,
	TextDocument
} from 'vscode-languageserver-textdocument';
  
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  const memCache = { uris: []} as { [key: string]: any };

  function kebabCaseToCamelCase(str: string): string {
	return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  connection.onInitialize((params: InitializeParams): InitializeResult => {
	return {
		capabilities: {
			definitionProvider: true,
		},
	};
});

const GetFileContentRequest = new RequestType<string, string, void>('getFileContent');
  
async function parseJsFiles(uris: string[]): Promise<Map<string, Definition>> {
	const componentsMap = new Map<string, Definition>();
  
	for (const uri of uris) {
	  const fileContent = await connection.sendRequest(GetFileContentRequest, uri);
	  if (!fileContent) {
		continue;
	  }
  
	  const regex = /(?:\.directive|\.component)\(\s*['"]([^'"]+)['"]/g;
	  let match;
	  while ((match = regex.exec(fileContent)) !== null) {
		const componentName = match[1];
		// const kebabComponentName = camelCaseToKebabCase(componentName);
		const position = getPositionFromOffset(fileContent, match.index);
		const definition: Definition = { uri, range: { start: position, end: position } };
  
		componentsMap.set(componentName, definition);
	  }
	}
  
	return componentsMap;
  }
  
  function getPositionFromOffset(content: string, offset: number): Position {
	const lines = content.slice(0, offset).split('\n');
	const line = lines.length - 1;
	const character = lines[lines.length - 1].length;
	return { line, character };
  }
  
  
  
  
  let componentsMapCache: Map<string, Definition> = new Map<string, Definition>();
  
  connection.onDefinition(async (params: TextDocumentPositionParams): Promise<Definition | undefined> => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return undefined;
	}
  
	// Use the cached map of component names and their locations if available
	if(componentsMapCache.entries.length === 0){
		componentsMapCache = await parseJsFiles(memCache.uris);
	}
  
	// Get the word under the cursor
	const word = getWordAt(document, params.position);
  
	// Convert the word to camelCase and find the corresponding definition in the componentsMap
	const componentName = kebabCaseToCamelCase(word);
	const definition = componentsMapCache?.get(componentName);
	
	return definition;
  });

  connection.onNotification('parseJsFiles', (uris: string[]) => {
	const fileStringsToExclude = [
		'node_modules',
		'dist',
		'build',
		'coverage',
		'test',
		'tests',
		'spec',
		'specs',
		'e2e',
		'mock',
		'mocks',
		'fixture',
		'fixtures',
		'stub',
		'stubs',
		'support',
		'vendor',
		'tmp',
		'temp',
		'lib'
	  ];
  
	memCache.uris = uris.filter(uri => uri.endsWith('.js') && !fileStringsToExclude.some(str => uri.includes(str)));
  });
  

  function getWordAt(document: TextDocument, position: Position): string {
	const line = document.getText({ start: { line: position.line, character: 0 }, end: { line: position.line, character: Number.MAX_VALUE } });
	const pattern = /([\w-]+)/g;
  
	let wordMatch: RegExpExecArray | null;
	while ((wordMatch = pattern.exec(line)) !== null) {
	  const startCharacter = wordMatch.index;
	  const endCharacter = startCharacter + wordMatch[0].length;
	  if (startCharacter <= position.character && position.character <= endCharacter) {
		return wordMatch[0];
	  }
	}
  
	return '';
  }
  
  documents.onDidChangeContent((change) => {
	// Invalidate the cache if a JavaScript file changes
	if (change.document.languageId === "javascript") {
	  componentsMapCache = new Map<string, Definition>();
	}
  });
  
  documents.listen(connection);
  connection.listen();
  