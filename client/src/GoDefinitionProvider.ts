
import * as vscode from "vscode";
import { LanguageClient } from 'vscode-languageclient/node';

// New class for the definition provider
export default class GoDefinitionProvider implements vscode.DefinitionProvider {
	private client: LanguageClient;

	constructor(client: LanguageClient) {
		this.client = client;
	}

	public async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.Definition | undefined> {
		this.client.code2ProtocolConverter.asTextDocumentPositionParams(document, position);
		return undefined;
	}
}