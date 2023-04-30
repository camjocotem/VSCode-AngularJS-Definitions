import { Position, TextDocument } from 'vscode-languageserver-textdocument';

export function getPositionFromOffset(content: string, offset: number): Position {
	const lines = content.slice(0, offset).split('\n');
	const line = lines.length - 1;
	const character = lines[lines.length - 1].length;
	return { line, character };
}

export function kebabCaseToCamelCase(str: string): string {
	return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}


export function getWordAt(document: TextDocument, position: Position): string {
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