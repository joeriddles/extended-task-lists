import { describe, expect, test } from "@jest/globals";
import { FileStats } from "obsidian";
import { IFile, IFileService } from "./fileService";
import TodoService, { TaskType, Todo, TodoFile } from "./todoService";

const MOCK_SETTINGS = {
	todoFilename: "TODO.md",
	excludeFilePattern: "<!-- exclude TODO -->",
	excludeFolderFilename: ".exclude_todos",
	excludeRegionBegin: "%% exclude: start %%",
	excludeRegionEnd: "%% exclude: end %%",
	useFullFilepath: false,
	useHierarchy: false,
	enableNestedTodos: false,
	excludeNestedFromParent: true,
	includeNotStarted: true,
	includeInProgress: true,
	includeWontDo: false,
	includeDone: false,
};

interface MockFile extends IFile {
	name: string;
	path: string;
	basename: string;
	parent: MockFile | null;
	children: MockFile[];
	stat: FileStats;
	content: string;
}

function createMockFile(
	name: string,
	content: string,
	parent: MockFile | null = null,
): MockFile {
	let path = `/${name}`;
	if (parent) {
		path = parent.path + path;
	}

	const file = {
		name,
		content,
		parent,
		children: [],
		path,
		basename: name,
		stat: {
			ctime: 1,
			mtime: 2,
			size: 3,
		},
	} as MockFile;

	if (parent) {
		parent.children.push(file);
	}

	return file;
}

class MockFileService implements IFileService {
	private files: MockFile[];

	constructor(files: MockFile[]) {
		this.files = files;
	}

	async getFileByPath(path: string): Promise<IFile | null> {
		return this.files.find((f) => f.path === path) ?? null;
	}

	async getFiles(): Promise<IFile[]> {
		return this.files.filter((f) => f.name.endsWith(".md"));
	}

	async readFile(file: IFile): Promise<string> {
		return this.files.filter((f) => f.path === file.path)[0].content;
	}

	async updateFile(file: IFile, data: string): Promise<void> {
		this.files.filter((f) => f.path === file.path)[0].content = data;
	}

	async checkExists(filepath: string): Promise<boolean> {
		filepath = filepath.substring(1); // remove leading "/"
		const parts = filepath.split("/");
		let files = this.files;
		while (parts.length) {
			const filename = parts.shift();
			const file = files.find((f) => f.name === filename);
			if (!file) {
				return false;
			}
			files = file.children;
		}

		return true;
	}
}

describe("TodoService", () => {
	test("findTodosFiles excludes files", async () => {
		// Arrange
		const taskFile = createMockFile("test.md", "- [ ] task item");
		const todoFile = createMockFile("TODO.md", "...");
		const fileWithExcludeComment = createMockFile(
			"Exclude.md",
			"<!-- exclude TODO -->",
		);

		const folder = createMockFile("Folder", "");
		const fileInFolderWithExcludeFile = createMockFile(
			"ExcludeParent.md",
			"- [ ] excluded task item",
			folder,
		);
		const excludeFolderFile = createMockFile(".exclude_todos", "", folder);

		const nestedFolder = createMockFile("NestedFolder", "", folder);
		const nestedFileInFolderWithExcludeFile = createMockFile(
			"DeeplyNested.md",
			"- [ ] excluded task item",
			nestedFolder,
		);
		const nestedExcludeFolderFile = createMockFile(
			".exclude_todos",
			"",
			nestedFolder,
		);

		const files = [
			taskFile,
			todoFile,
			fileWithExcludeComment,
			folder,
			fileInFolderWithExcludeFile,
			excludeFolderFile,
			nestedFolder,
			nestedFileInFolderWithExcludeFile,
			nestedExcludeFolderFile,
		];

		const mockFileService = new MockFileService(files);

		// Act
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);
		const actual = await todoService.findTodosFiles();

		// Assert
		const expected = [
			{
				file: files[0],
				contents: "- [ ] task item",
			} as TodoFile,
		];

		expect(actual).toEqual(expected);
	});

	test("parseTodos parses all types of task items", () => {
		// Arrange
		const content = `
- [ ] Pending
- [.] In progress
- [~] Won't do
- [x] Done`;

		const mockFileService = new MockFileService([]);

		// Act
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);
		const actual = todoService.parseTodos(content);

		// Assert
		const expected = [
			{
				task: TaskType.NotStarted,
				text: "Pending",
				indentation: "",
				lineno: 1,
			} as Todo,
			{
				task: TaskType.InProgress,
				text: "In progress",
				indentation: "",
				lineno: 2,
			} as Todo,
			{
				task: TaskType.WontDo,
				text: "Won't do",
				indentation: "",
				lineno: 3,
			} as Todo,
			{
				task: TaskType.Done,
				text: "Done",
				indentation: "",
				lineno: 4,
			} as Todo,
		];

		expect(actual).toEqual(expected);
	});

	test("parseTodos parses nested task items", () => {
		// Arrange
		const content = `
- [ ] Pending
    - [.] In progress
        - [~] Won't do
            - [x] Done`;

		const mockFileService = new MockFileService([]);

		// Act
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);
		const actual = todoService.parseTodos(content);

		// Assert
		const expected = [
			{
				task: TaskType.NotStarted,
				text: "Pending",
				indentation: "",
				lineno: 1,
			} as Todo,
			{
				task: TaskType.InProgress,
				text: "In progress",
				indentation: "    ",
				lineno: 2,
			} as Todo,
			{
				task: TaskType.WontDo,
				text: "Won't do",
				indentation: "        ",
				lineno: 3,
			} as Todo,
			{
				task: TaskType.Done,
				text: "Done",
				indentation: "            ",
				lineno: 4,
			} as Todo,
		];

		expect(actual).toEqual(expected);
	});

	test("saveTodos formats the file contents correctly", async () => {
		// Arrange
		const tasksFile = createMockFile("Tasks.md", "");

		const todos = [
			{
				task: TaskType.NotStarted,
				text: "Pending",
				lineno: 0,
				indentation: "",
				file: tasksFile,
			} as Todo,
			{
				task: TaskType.InProgress,
				text: "In progress",
				lineno: 1,
				indentation: "    ",
				file: tasksFile,
			} as Todo,
			{
				task: TaskType.WontDo,
				text: "Won't do",
				lineno: 2,
				indentation: "        ",
				file: tasksFile,
			} as Todo,
			{
				task: TaskType.Done,
				text: "Done",
				lineno: 3,
				indentation: "            ",
				file: tasksFile,
			} as Todo,
		];

		const todoFile = createMockFile("TODO.md", "");
		const mockFileService = new MockFileService([todoFile]);

		// Act
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);
		await todoService.saveTodos(todoFile, todos);

		// Assert
		const expected = `- [Tasks.md](/Tasks.md)
\t- [ ] Pending
\t    - [.] In progress
`;

		const actual = todoFile.content;
		expect(actual).toEqual(expected);
	});

	test("saveTodos formats file link correct", async () => {
		// Arrange
		const folder = createMockFile("Folder", "");
		const tasksFile = createMockFile("Tasks & Porpoises 🐬.md", "", folder);

		const todos = [
			{
				task: TaskType.NotStarted,
				text: "Pending",
				indentation: "",
				lineno: 0,
				file: tasksFile,
			} as Todo,
		];

		const todoFile = createMockFile("TODO.md", "");
		const mockFileService = new MockFileService([todoFile]);

		// Act
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);
		await todoService.saveTodos(todoFile, todos);

		// Assert
		const expected = `- [Tasks & Porpoises 🐬.md](/Folder/Tasks%20&%20Porpoises%20%F0%9F%90%AC.md)
\t- [ ] Pending
`;

		const actual = todoFile.content;
		expect(actual).toEqual(expected);
	});

	test("saveTodos sorts task item headers by created time", async () => {
		// Arrange
		const oldFile = createMockFile("Old.md", "");
		const midFile = createMockFile("Mid.md", "");
		const newFile = createMockFile("New.md", "");
		oldFile.stat.ctime = 1;
		midFile.stat.ctime = 2;
		newFile.stat.ctime = 3;

		const todos = [
			{
				task: TaskType.NotStarted,
				text: "New TODO",
				indentation: "",
				lineno: 0,
				file: newFile,
			} as Todo,
			{
				task: TaskType.NotStarted,
				text: "Old TODO",
				indentation: "",
				lineno: 0,
				file: oldFile,
			} as Todo,
			{
				task: TaskType.NotStarted,
				text: "Mid TODO",
				indentation: "",
				lineno: 0,
				file: midFile,
			} as Todo,
		];

		const todoFile = createMockFile("TODO.md", "");
		const mockFileService = new MockFileService([todoFile]);

		// Act
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);
		await todoService.saveTodos(todoFile, todos);

		// Assert
		const expected = `- [Old.md](/Old.md)
\t- [ ] Old TODO
- [Mid.md](/Mid.md)
\t- [ ] Mid TODO
- [New.md](/New.md)
\t- [ ] New TODO
`;

		const actual = todoFile.content;
		expect(actual).toEqual(expected);
	});

	test("parseTodos excludes task items inside exclude regions", () => {
		// Arrange
		const content = `- [ ] Included
%% exclude: start %%
- [ ] Excluded
- [.] Also excluded
%% exclude: end %%
- [ ] Also included`;

		const mockFileService = new MockFileService([]);

		// Act
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);
		const actual = todoService.parseTodos(content);

		// Assert
		expect(actual).toEqual([
			{
				task: TaskType.NotStarted,
				text: "Included",
				indentation: "",
				lineno: 0,
			} as Todo,
			{
				task: TaskType.NotStarted,
				text: "Also included",
				indentation: "",
				lineno: 5,
			} as Todo,
		]);
	});

	test("parseTodos handles multiple exclude regions", () => {
		// Arrange
		const content = `- [ ] First
%% exclude: start %%
- [ ] Excluded 1
%% exclude: end %%
- [ ] Second
%% exclude: start %%
- [ ] Excluded 2
%% exclude: end %%
- [ ] Third`;

		const mockFileService = new MockFileService([]);

		// Act
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);
		const actual = todoService.parseTodos(content);

		// Assert
		expect(actual.map((t) => t.text)).toEqual(["First", "Second", "Third"]);
	});

	test("parseTodos excludes to end of file when region is not closed", () => {
		// Arrange
		const content = `- [ ] Included
%% exclude: start %%
- [ ] Excluded`;

		const mockFileService = new MockFileService([]);

		// Act
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);
		const actual = todoService.parseTodos(content);

		// Assert
		expect(actual.map((t) => t.text)).toEqual(["Included"]);
	});

	test("saveTodos with useHierarchy organizes by folder structure", async () => {
		// Arrange
		const year = createMockFile("2022", "");
		const month = createMockFile("06_June", "", year);
		const dayFile = createMockFile("08_Wednesday.md", "", month);

		const todos = [
			{
				task: TaskType.NotStarted,
				text: "do the thing",
				indentation: "",
				lineno: 0,
				file: dayFile,
			} as Todo,
		];

		const todoFile = createMockFile("TODO.md", "");
		const mockFileService = new MockFileService([todoFile]);

		const settings = {
			...MOCK_SETTINGS,
			useHierarchy: true,
		};

		// Act
		const todoService = new TodoService(mockFileService, settings);
		await todoService.saveTodos(todoFile, todos);

		// Assert
		const expected = `- 2022
\t- 06_June
\t\t- [08_Wednesday.md](/2022/06_June/08_Wednesday.md)
\t\t\t- [ ] do the thing
`;

		const actual = todoFile.content;
		expect(actual).toEqual(expected);
	});

	test("saveTodos with useHierarchy handles multiple files in different folders", async () => {
		// Arrange
		const folderA = createMockFile("FolderA", "");
		const fileA = createMockFile("Tasks.md", "", folderA);

		const folderB = createMockFile("FolderB", "");
		const fileB = createMockFile("Notes.md", "", folderB);

		const todos = [
			{
				task: TaskType.NotStarted,
				text: "task A",
				indentation: "",
				lineno: 0,
				file: fileA,
			} as Todo,
			{
				task: TaskType.NotStarted,
				text: "task B",
				indentation: "",
				lineno: 0,
				file: fileB,
			} as Todo,
		];

		const todoFile = createMockFile("TODO.md", "");
		const mockFileService = new MockFileService([todoFile]);

		const settings = {
			...MOCK_SETTINGS,
			useHierarchy: true,
		};

		// Act
		const todoService = new TodoService(mockFileService, settings);
		await todoService.saveTodos(todoFile, todos);

		// Assert
		const expected = `- FolderA
\t- [Tasks.md](/FolderA/Tasks.md)
\t\t- [ ] task A
- FolderB
\t- [Notes.md](/FolderB/Notes.md)
\t\t- [ ] task B
`;

		const actual = todoFile.content;
		expect(actual).toEqual(expected);
	});

	test("saveTodos with useHierarchy handles files at root level", async () => {
		// Arrange
		const rootFile = createMockFile("Tasks.md", "");
		const folder = createMockFile("Folder", "");
		const nestedFile = createMockFile("Notes.md", "", folder);

		const todos = [
			{
				task: TaskType.NotStarted,
				text: "root task",
				indentation: "",
				lineno: 0,
				file: rootFile,
			} as Todo,
			{
				task: TaskType.NotStarted,
				text: "nested task",
				indentation: "",
				lineno: 0,
				file: nestedFile,
			} as Todo,
		];

		const todoFile = createMockFile("TODO.md", "");
		const mockFileService = new MockFileService([todoFile]);

		const settings = {
			...MOCK_SETTINGS,
			useHierarchy: true,
		};

		// Act
		const todoService = new TodoService(mockFileService, settings);
		await todoService.saveTodos(todoFile, todos);

		// Assert
		const expected = `- Folder
\t- [Notes.md](/Folder/Notes.md)
\t\t- [ ] nested task
- [Tasks.md](/Tasks.md)
\t- [ ] root task
`;

		const actual = todoFile.content;
		expect(actual).toEqual(expected);
	});

	test("saveTodos with useHierarchy preserves nested todo indentation", async () => {
		// Arrange
		const folder = createMockFile("Projects", "");
		const file = createMockFile("Work.md", "", folder);

		const todos = [
			{
				task: TaskType.NotStarted,
				text: "parent task",
				indentation: "",
				lineno: 0,
				file: file,
			} as Todo,
			{
				task: TaskType.InProgress,
				text: "child task",
				indentation: "    ",
				lineno: 1,
				file: file,
			} as Todo,
		];

		const todoFile = createMockFile("TODO.md", "");
		const mockFileService = new MockFileService([todoFile]);

		const settings = {
			...MOCK_SETTINGS,
			useHierarchy: true,
		};

		// Act
		const todoService = new TodoService(mockFileService, settings);
		await todoService.saveTodos(todoFile, todos);

		// Assert
		const expected = `- Projects
\t- [Work.md](/Projects/Work.md)
\t\t- [ ] parent task
\t\t    - [.] child task
`;

		const actual = todoFile.content;
		expect(actual).toEqual(expected);
	});

	test("saveTodos with useHierarchy shares common folder prefixes", async () => {
		// Arrange
		const folder = createMockFile("2022", "");
		const sub1 = createMockFile("Q1", "", folder);
		const sub2 = createMockFile("Q2", "", folder);
		const file1 = createMockFile("Jan.md", "", sub1);
		const file2 = createMockFile("Apr.md", "", sub2);

		const todos = [
			{
				task: TaskType.NotStarted,
				text: "jan task",
				indentation: "",
				lineno: 0,
				file: file1,
			} as Todo,
			{
				task: TaskType.NotStarted,
				text: "apr task",
				indentation: "",
				lineno: 0,
				file: file2,
			} as Todo,
		];

		const todoFile = createMockFile("TODO.md", "");
		const mockFileService = new MockFileService([todoFile]);

		const settings = {
			...MOCK_SETTINGS,
			useHierarchy: true,
		};

		// Act
		const todoService = new TodoService(mockFileService, settings);
		await todoService.saveTodos(todoFile, todos);

		// Assert
		const expected = `- 2022
\t- Q1
\t\t- [Jan.md](/2022/Q1/Jan.md)
\t\t\t- [ ] jan task
\t- Q2
\t\t- [Apr.md](/2022/Q2/Apr.md)
\t\t\t- [ ] apr task
`;

		const actual = todoFile.content;
		expect(actual).toEqual(expected);
	});

	test("findAllTodoFiles returns all TODO.md files including nested ones", async () => {
		// Arrange
		const rootTodo = createMockFile("TODO.md", "");
		const folder = createMockFile("Projects", "");
		const nestedTodo = createMockFile("TODO.md", "", folder);
		const tasksFile = createMockFile("Tasks.md", "", folder);

		const mockFileService = new MockFileService([
			rootTodo,
			folder,
			nestedTodo,
			tasksFile,
		]);

		// Act
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);
		const actual = await todoService.findAllTodoFiles();

		// Assert
		expect(actual).toEqual([rootTodo, nestedTodo]);
	});

	test("filterTodosByScope returns all todos for root TODO.md", () => {
		// Arrange
		const folderA = createMockFile("FolderA", "");
		const fileA = createMockFile("Tasks.md", "", folderA);
		const fileRoot = createMockFile("Notes.md", "");

		const todos: Todo[] = [
			{
				task: TaskType.NotStarted,
				text: "task A",
				indentation: "",
				lineno: 0,
				file: fileA,
			},
			{
				task: TaskType.NotStarted,
				text: "root task",
				indentation: "",
				lineno: 0,
				file: fileRoot,
			},
		];

		const mockFileService = new MockFileService([]);
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);

		// Act
		const actual = todoService.filterTodosByScope(todos, "/TODO.md");

		// Assert
		expect(actual).toEqual(todos);
	});

	test("filterTodosByScope returns only folder-scoped todos for nested TODO.md", () => {
		// Arrange
		const projects = createMockFile("Projects", "");
		const fileA = createMockFile("api.md", "", projects);
		const notes = createMockFile("Notes", "");
		const fileB = createMockFile("diary.md", "", notes);

		const todoA: Todo = {
			task: TaskType.NotStarted,
			text: "api task",
			indentation: "",
			lineno: 0,
			file: fileA,
		};
		const todoB: Todo = {
			task: TaskType.NotStarted,
			text: "diary task",
			indentation: "",
			lineno: 0,
			file: fileB,
		};

		const mockFileService = new MockFileService([]);
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);

		// Act
		const actual = todoService.filterTodosByScope(
			[todoA, todoB],
			"/Projects/TODO.md",
		);

		// Assert
		expect(actual).toEqual([todoA]);
	});

	test("filterTodosByScope handles deeply nested scope", () => {
		// Arrange
		const projects = createMockFile("Projects", "");
		const backend = createMockFile("Backend", "", projects);
		const fileDeep = createMockFile("db.md", "", backend);
		const fileShallow = createMockFile("api.md", "", projects);

		const todoDeep: Todo = {
			task: TaskType.NotStarted,
			text: "db task",
			indentation: "",
			lineno: 0,
			file: fileDeep,
		};
		const todoShallow: Todo = {
			task: TaskType.NotStarted,
			text: "api task",
			indentation: "",
			lineno: 0,
			file: fileShallow,
		};

		const mockFileService = new MockFileService([]);
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);

		// Act
		const actual = todoService.filterTodosByScope(
			[todoDeep, todoShallow],
			"/Projects/Backend/TODO.md",
		);

		// Assert
		expect(actual).toEqual([todoDeep]);
	});

	test("filterTodosByScope handles paths without leading slash", () => {
		// Arrange
		const projects = createMockFile("Projects", "");
		const fileA = createMockFile("api.md", "", projects);
		// Simulate Obsidian-style paths (no leading slash)
		(fileA as MockFile).path = "Projects/api.md";

		const todo: Todo = {
			task: TaskType.NotStarted,
			text: "api task",
			indentation: "",
			lineno: 0,
			file: fileA,
		};

		const mockFileService = new MockFileService([]);
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);

		// Act
		const actual = todoService.filterTodosByScope(
			[todo],
			"Projects/TODO.md",
		);

		// Assert
		expect(actual).toEqual([todo]);
	});

	test("saveTodos writes scoped todos to nested TODO.md", async () => {
		// Arrange
		const projects = createMockFile("Projects", "");
		const fileA = createMockFile("api.md", "", projects);
		const notes = createMockFile("Notes", "");
		const fileB = createMockFile("diary.md", "", notes);

		const todoA: Todo = {
			task: TaskType.NotStarted,
			text: "api task",
			indentation: "",
			lineno: 0,
			file: fileA,
		};
		const todoB: Todo = {
			task: TaskType.NotStarted,
			text: "diary task",
			indentation: "",
			lineno: 0,
			file: fileB,
		};

		const nestedTodo = createMockFile("TODO.md", "", projects);
		const mockFileService = new MockFileService([nestedTodo]);
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);

		// Act
		const scoped = todoService.filterTodosByScope(
			[todoA, todoB],
			nestedTodo.path,
		);
		await todoService.saveTodos(nestedTodo, scoped);

		// Assert
		const expected = `- [api.md](/Projects/api.md)\n\t- [ ] api task\n`;
		expect(nestedTodo.content).toEqual(expected);
	});

	test("saveTodos with useHierarchy and nested TODO strips scope prefix", async () => {
		// Arrange
		const year = createMockFile("2026", "");
		const month = createMockFile("05_May", "", year);
		const dayFile = createMockFile("12_Tuesday.md", "", month);

		const todos = [
			{
				task: TaskType.NotStarted,
				text: "do the thing",
				indentation: "",
				lineno: 0,
				file: dayFile,
			} as Todo,
		];

		const nestedTodo = createMockFile("TODO.md", "", month);
		const mockFileService = new MockFileService([nestedTodo]);

		const settings = {
			...MOCK_SETTINGS,
			useHierarchy: true,
		};

		// Act
		const todoService = new TodoService(mockFileService, settings);
		await todoService.saveTodos(nestedTodo, todos);

		// Assert — hierarchy should be relative to the TODO's folder
		const expected = `- [12_Tuesday.md](/2026/05_May/12_Tuesday.md)
\t- [ ] do the thing
`;

		expect(nestedTodo.content).toEqual(expected);
	});

	test("Whole shebang formats TODO.md correctly with task items nested under normal lists", async () => {
		// Arrange
		const taskFile = createMockFile(
			"Tasks.md",
			`
- some list
    - more lists
        - [ ] task item
- some list
    - [ ] another task item
        - [ ] nested task item
- [ ] top task item
    - [ ] mid task item
        - [ ] bottom task item
    `,
		);
		const todoFile = createMockFile("TODO.md", "");
		const mockFileService = new MockFileService([taskFile, todoFile]);

		// Act
		const todoService = new TodoService(mockFileService, MOCK_SETTINGS);
		const todos = todoService.parseTodos(taskFile.content);
		todos.forEach((todo) => (todo.file = taskFile));
		await todoService.saveTodos(todoFile, todos);

		// Assert
		const expected = `- [Tasks.md](/Tasks.md)
\t- [ ] task item
\t- [ ] another task item
\t    - [ ] nested task item
\t- [ ] top task item
\t    - [ ] mid task item
\t        - [ ] bottom task item
`;

		const actual = todoFile.content;
		expect(actual).toEqual(expected);
	});
});
