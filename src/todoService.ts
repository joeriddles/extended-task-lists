/**
 * TypeScript mirror of https://github.com/joeriddles/notes
 */

import { ExtendedTaskListsSettings } from "src/settings";
import { IFile, IFileService } from "./fileService";

enum TaskType {
	NotStarted = " ",
	InProgress = ".",
	WontDo = "~",
	Done = "x",
}

interface TodoFile {
	file: IFile;
	contents: string;
}

interface Todo {
	task: TaskType;
	text: string;
	lineno: number;
	indentation: string;
	file: IFile;
}

interface IndexMatch {
	match: RegExpMatchArray;
	index: number;
}

const TODO_PATTERN = /^(?<indentation>\s*)-\s?\[(?<task>.)\]\s+(?<text>.*)$/;
const LINK_PATTERN = /^- \[.*\]\((?<path>.*)\)$/;

class TodoService {
	private fileService: IFileService;
	private settings: ExtendedTaskListsSettings;
	private excludeCache: { [path: string]: boolean };

	constructor(
		fileService: IFileService,
		settings: ExtendedTaskListsSettings,
	) {
		this.fileService = fileService;
		this.settings = settings;
		this.excludeCache = {};
	}

	/**
	 * Find all the non-excluded Markdown files that _may_ contain task items.
	 */
	async findTodosFiles(): Promise<TodoFile[]> {
		const markdownFiles = await this.fileService.getFiles();
		const shouldExcludeFiles = await Promise.all(
			markdownFiles.map(
				async (file) => await this.getShouldExcludeFile(file),
			),
		);
		const filteredMarkdownFiles = markdownFiles.filter(
			(_, index) => !shouldExcludeFiles[index],
		);

		let todoFiles = await Promise.all(
			filteredMarkdownFiles.map(async (file) => {
				const contents = await this.fileService.readFile(file);
				return { file, contents } as TodoFile;
			}),
		);

		todoFiles = todoFiles.filter(
			(todoFile) =>
				!todoFile.contents
					.split(/[\r\n]+/)
					.some(
						(line) =>
							line.trim() === this.settings.excludeFilePattern,
					),
		);
		return todoFiles;
	}

	async findAllTodoFiles(): Promise<IFile[]> {
		const allFiles = await this.fileService.getFiles();
		return allFiles.filter(
			(file) => file.name === this.settings.todoFilename,
		);
	}

	filterTodosByScope(todos: Todo[], todoFilePath: string): Todo[] {
		const normalizedPath = todoFilePath.replace(/^\//, "");
		const lastSlash = normalizedPath.lastIndexOf("/");

		if (lastSlash < 0) {
			return [...todos];
		}

		const folderPrefix = normalizedPath.substring(0, lastSlash + 1);

		return todos.filter((todo) => {
			const filePath = todo.file.path.replace(/^\//, "");
			return filePath.startsWith(folderPrefix);
		});
	}

	/**
	 * Parse the auto-generated TODO file
	 */
	parseTodoFile(contents: string): Map<string, Todo[]> {
		const lines = contents.split(/[\r]?[\n]/);
		const files: Map<string, Todo[]> = new Map();
		let currentFilePath = "";
		lines.forEach((line, index) => {
			let match = line.match(LINK_PATTERN);
			if (match?.groups != null) {
				const encodedfilePath = match.groups.path;
				const filePath = decodeURI(encodedfilePath);
				currentFilePath = filePath;
				files.set(currentFilePath, []);
				return;
			}

			match = line.match(TODO_PATTERN);
			if (match != null) {
				const todo = this.parseTodo({ match, index } as IndexMatch);
				const todos = files.get(currentFilePath);
				if (todos) {
					todos.push(todo);
				}
			}
		});
		return files;
	}

	/**
	 * Parse all the task items from the string
	 */
	parseTodos(contents: string): Todo[] {
		const lines = contents.split(/[\r]?[\n]/);
		const beginPattern = this.settings.excludeRegionBegin;
		const endPattern = this.settings.excludeRegionEnd;
		let inExcludedRegion = false;
		const matchesAndIndices = lines
			.map((line, index) => {
				if (beginPattern && line.trim() === beginPattern) {
					inExcludedRegion = true;
				}
				if (inExcludedRegion) {
					if (endPattern && line.trim() === endPattern) {
						inExcludedRegion = false;
					}
					return {
						match: null as unknown as RegExpMatchArray,
						index,
					} as IndexMatch;
				}
				const match = line.match(TODO_PATTERN);
				return { match, index } as IndexMatch;
			})
			.filter((indexMatch) => indexMatch.match != null);

		const todos = matchesAndIndices.map((m) => this.parseTodo(m));

		const todoToPrevSibling: Map<Todo, Todo | null> = new Map();
		todos.forEach((todo) => {
			const prevSibling =
				todos.find((t) => t.lineno === todo.lineno - 1) || null;
			todoToPrevSibling.set(todo, prevSibling);
		});

		const kvps = [...todoToPrevSibling];

		kvps.filter((kvp) => kvp[1] == null).forEach(
			(kvp) => (kvp[0].indentation = ""),
		);

		// Is the task item nested under the previous task item?
		kvps.filter(
			(kvp) =>
				kvp[1] != null &&
				kvp[0].indentation.length > kvp[1].indentation.length,
		).forEach((kvp) => {
			kvp[0].indentation = (kvp[1]?.indentation ?? "") + "    ";
		});

		return todos;
	}

	private parseTodo(match: IndexMatch): Todo {
		const lineno = match.index;
		const task = match.match.groups?.task;
		const text = match.match.groups?.text;
		const indentation = match.match.groups?.indentation;
		return { task, text, indentation, lineno } as Todo;
	}

	/**
	 * Find and update the task item in the file
	 */
	async updateTodos(contents: string, updates: Todo[]): Promise<string> {
		const lines = contents.split(/[\r]?[\n]/);
		const newLines = lines.map((line, index) => {
			const match = line.match(TODO_PATTERN);
			if (match == null) return line;

			const todo = this.parseTodo({ match, index });
			const update = updates.find((update) => update.text === todo.text);
			if (update == null) return line;

			const updatedLine = line.replace(/-\s?\[.\]/, `- [${update.task}]`);
			return updatedLine;
		});
		const updatedContent = newLines.join("\n");
		return updatedContent;
	}

	/**
	 * Save the task items to the TODO file
	 */
	async saveTodos(todoFile: IFile, todos: Todo[]): Promise<void> {
		let data = "";

		// Sort oldest-to-newest
		todos.sort((a, b) => a.file.stat.ctime - b.file.stat.ctime);

		// Exclude finished tasks
		const includedTaskTypes = this.getIncludedTaskTypes();
		todos = todos.filter((todo) => includedTaskTypes.has(todo.task));

		// Group by file
		const todosByFile: Map<IFile, Todo[]> = new Map();
		todos.forEach((todo) => {
			if (!todosByFile.get(todo.file)) {
				todosByFile.set(todo.file, []);
			}

			const todos = todosByFile.get(todo.file);
			if (todos) {
				todos.push(todo);
			}
		});

		if (this.settings.useHierarchy) {
			data = this.formatHierarchy(todosByFile, todoFile);
		} else {
			todosByFile.forEach((todos, file) => {
				const urlEncodedFilePath = encodeURI(file.path);

				const heading = this.settings.useFullFilepath
					? `- [${file.path}](${urlEncodedFilePath})\n`
					: `- [${file.basename}](${urlEncodedFilePath})\n`;

				data += heading;

				todos.forEach((todo) => {
					data += `\t${todo.indentation}- [${todo.task}] ${todo.text}\n`;
				});
			});
		}

		this.fileService
			.updateFile(todoFile, data)
			.catch((err) => console.error(err));
	}

	private formatHierarchy(
		todosByFile: Map<IFile, Todo[]>,
		todoFile: IFile,
	): string {
		interface FolderNode {
			name: string;
			children: Map<string, FolderNode>;
			files: { file: IFile; todos: Todo[] }[];
		}

		const todoDir = todoFile.path.replace(/^\//, "").replace(/[^/]+$/, "");

		const root: FolderNode = { name: "", children: new Map(), files: [] };

		todosByFile.forEach((todos, file) => {
			let relativePath = file.path.replace(/^\//, "");
			if (todoDir && relativePath.startsWith(todoDir)) {
				relativePath = relativePath.substring(todoDir.length);
			}
			const parts = relativePath.split("/");
			parts.pop();
			let node = root;
			for (const part of parts) {
				if (!node.children.has(part)) {
					node.children.set(part, {
						name: part,
						children: new Map(),
						files: [],
					});
				}
				const child = node.children.get(part);
				if (child) {
					node = child;
				}
			}
			node.files.push({ file, todos });
		});

		let data = "";
		const renderNode = (node: FolderNode, depth: number) => {
			const indent = "\t".repeat(depth);

			const sortedChildren = [...node.children.values()].sort((a, b) =>
				a.name.localeCompare(b.name),
			);
			for (const child of sortedChildren) {
				data += `${indent}- ${child.name}\n`;
				renderNode(child, depth + 1);
			}

			for (const { file, todos } of node.files) {
				const urlEncodedFilePath = encodeURI(file.path);
				data += `${indent}- [${file.basename}](${urlEncodedFilePath})\n`;
				for (const todo of todos) {
					data += `${indent}\t${todo.indentation}- [${todo.task}] ${todo.text}\n`;
				}
			}
		};

		renderNode(root, 0);
		return data;
	}

	getIncludedTaskTypes(): Set<TaskType> {
		const taskTypes = new Set<TaskType>();
		if (this.settings.includeNotStarted) taskTypes.add(TaskType.NotStarted);
		if (this.settings.includeInProgress) taskTypes.add(TaskType.InProgress);
		if (this.settings.includeWontDo) taskTypes.add(TaskType.WontDo);
		if (this.settings.includeDone) taskTypes.add(TaskType.Done);
		return taskTypes;
	}

	private async getShouldExcludeFile(file: IFile): Promise<boolean> {
		const isTodoFile = file.name == this.settings.todoFilename;
		if (isTodoFile) {
			return true;
		}

		if (this.excludeCache[file.path]) {
			return true;
		}

		let parentPath = file.parent?.path ?? "";
		if (!parentPath) {
			return false;
		}

		if (parentPath.at(0) !== "/") {
			parentPath = "/" + parentPath;
		}
		let excludeFolderFilepath = parentPath.endsWith("/")
			? parentPath + this.settings.excludeFolderFilename
			: `${parentPath}/${this.settings.excludeFolderFilename}`;

		// Short-circuit if a cached value for the folder is found
		if (this.excludeCache[parentPath] != null) {
			return this.excludeCache[parentPath];
		}

		excludeFolderFilepath = excludeFolderFilepath.replace("//", "/");
		let isFolderExcluded = await this.fileService.checkExists(
			excludeFolderFilepath,
		);

		// Recurse upwards to check if the file is deeply nested in an excluded folder
		if (!isFolderExcluded && file.parent) {
			isFolderExcluded = await this.getShouldExcludeFile(file.parent);
		}

		// Cache checking this folder
		if (parentPath) {
			this.excludeCache[parentPath] = isFolderExcluded;
		}

		return isFolderExcluded;
	}
}

export default TodoService;
export { TaskType };
export type { Todo, TodoFile };
