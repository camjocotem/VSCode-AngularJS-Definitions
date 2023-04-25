console.log("START OF SERVER")

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
  
  import * as babelParser from "@babel/parser";
  import {
	  Position,
	TextDocument
} from 'vscode-languageserver-textdocument';
  
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);

  connection.onInitialize((params: InitializeParams): InitializeResult => {
	console.log("SERVER: onInitialize");
	return {
		capabilities: {
			definitionProvider: true,
		},
	};
});

  
  async function parseJsFiles(): Promise<Map<string, Definition>> {
	const componentsMap = new Map<string, Definition>();
  
	// Loop through all the JavaScript files in the workspace and parse them using @babel/parser
	// For each AngularJS component found, add an entry to the componentsMap
  
	return componentsMap;
  }
  
  let componentsMapCache: Promise<Map<string, Definition>> | null = null;
  
  connection.onDefinition(async (params: TextDocumentPositionParams): Promise<Definition | undefined> => {
	console.log("SERVER: onDefinition");
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return undefined;
	}
	else{
		console.log("SERVER: onDefinition | document", document);
	}
  
	// Use the cached map of component names and their locations if available
	const componentsMap = componentsMapCache || (componentsMapCache = parseJsFiles());
  
	// Get the word under the cursor
	const word = getWordAt(document, params.position);
  
	// Convert the word to camelCase and find the corresponding definition in the componentsMap
	const componentName = kebabCaseToCamelCase(word);
	const definition = (await componentsMap).get(componentName);
	
	return definition;
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
	console.log("SERVER: onDidChangeContent");
	// Invalidate the cache if a JavaScript file changes
	if (change.document.languageId === "javascript") {
	  componentsMapCache = null;
	}
  });
  
  documents.listen(connection);
  connection.listen();
  