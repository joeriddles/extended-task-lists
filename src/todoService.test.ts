import { describe, expect, test } from '@jest/globals';
import { FileStats } from 'obsidian';
import { IFile, IFileService } from './fileService';
import TodoService, { TaskType, Todo, TodoFile } from './todoService';

const MOCK_SETTINGS = {
  todoFilename: "TODO.md",
  excludeFilePattern: "<!-- exclude TODO -->",
  excludeFolderFilename: ".exclude_todos",
  useFullFilepath: false,
  includeNotStarted: true,
  includeInProgress: true,
  includeWontDo: false,
  includeDone: false,
}

interface MockFile extends IFile {
  name: string
  path: string
  basename: string
  parent: MockFile | null
  children: MockFile[]
  stat: FileStats
  content: string
}

function createMockFile(
  name: string,
  content: string,
  parent: MockFile | null = null,
): MockFile {

  let path = `/${name}`
  if (parent) {
    path = parent.path + path
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
  } as MockFile

  if (parent) {
    parent.children.push(file)
  }

  return file
}

class MockFileService implements IFileService {
  private files: MockFile[]

  constructor(files: MockFile[]) {
    this.files = files
  }

  async getFiles(): Promise<IFile[]> {
    return this.files.filter(f => f.name.endsWith(".md"))
  }

  async readFile(file: IFile): Promise<string> {
    return this.files.filter(f => f.name === file.name)[0].content
  }

  async updateFile(file: IFile, data: string): Promise<void> {
    this.files.filter(f => f.name === file.name)[0].content = data
  }

  async checkExists(filepath: string): Promise<boolean> {
    filepath = filepath.substring(1)  // remove leading "/"
    const parts = filepath.split("/")
    let files = this.files
    while (parts.length) {
      const filename = parts.shift()
      const file = files.find(f => f.name === filename)
      if (!file) {
        return false
      }
      files = file.children
    }

    return true
  }
}

describe("TodoService", () => {

  test("findTodosFiles excludes files", async () => {
    // Arrange
    const taskFile = createMockFile("test.md", "- [ ] task item")
    const todoFile = createMockFile("TODO.md", "...")
    const fileWithExcludeComment = createMockFile("Exclude.md", "<!-- exclude TODO -->")

    const folder = createMockFile("Folder", "")
    const fileInFolderWithExcludeFile = createMockFile("ExcludeParent.md", "- [ ] excluded task item", folder)
    const excludeFolderFile = createMockFile(".exclude_todos", "", folder)

    const nestedFolder = createMockFile("NestedFolder", "", folder)
    const nestedFileInFolderWithExcludeFile = createMockFile("DeeplyNested.md", "- [ ] excluded task item", nestedFolder)
    const nestedExcludeFolderFile = createMockFile(".exclude_todos", "", nestedFolder)

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
    ]

    const mockFileService = new MockFileService(files)

    // Act
    const todoService = new TodoService(mockFileService, MOCK_SETTINGS)
    const actual = await todoService.findTodosFiles()

    // Assert
    const expected = [
      {
        file: files[0],
        contents: "- [ ] task item"
      } as TodoFile
    ]

    expect(actual).toEqual(expected)
  })

  test("parseTodos parses all types of task items", () => {
    // Arrange
    const content = `
- [ ] Pending
- [.] In progress
- [~] Won't do
- [x] Done`

    const mockFileService = new MockFileService([])

    // Act
    const todoService = new TodoService(mockFileService, MOCK_SETTINGS)
    const actual = todoService.parseTodos(content)

    // Assert
    const expected = [
      {
        task: TaskType.NotStarted,
        text: "Pending",
        indentation: "",
      } as Todo,
      {
        task: TaskType.InProgress,
        text: "In progress",
        indentation: "",
      } as Todo,
      {
        task: TaskType.WontDo,
        text: "Won't do",
        indentation: "",
      } as Todo,
      {
        task: TaskType.Done,
        text: "Done",
        indentation: "",
      } as Todo,
    ]

    expect(actual).toEqual(expected)
  })

  test("parseTodos parses nested task items", () => {
    // Arrange
    const content = `
- [ ] Pending
    - [.] In progress
        - [~] Won't do
            - [x] Done`

    const mockFileService = new MockFileService([])

    // Act
    const todoService = new TodoService(mockFileService, MOCK_SETTINGS)
    const actual = todoService.parseTodos(content)

    // Assert
    const expected = [
      {
        task: TaskType.NotStarted,
        text: "Pending",
        indentation: "",
      } as Todo,
      {
        task: TaskType.InProgress,
        text: "In progress",
        indentation: "    ",
      } as Todo,
      {
        task: TaskType.WontDo,
        text: "Won't do",
        indentation: "        ",
      } as Todo,
      {
        task: TaskType.Done,
        text: "Done",
        indentation: "            ",
      } as Todo,
    ]

    expect(actual).toEqual(expected)
  })

  test("saveTodos formats the file contents correctly", async () => {
    // Arrange
    const tasksFile = createMockFile("Tasks.md", "")

    const todos = [
      {
        task: TaskType.NotStarted,
        text: "Pending",
        indentation: "",
        file: tasksFile,
      } as Todo,
      {
        task: TaskType.InProgress,
        text: "In progress",
        indentation: "    ",
        file: tasksFile,
      } as Todo,
      {
        task: TaskType.WontDo,
        text: "Won't do",
        indentation: "        ",
        file: tasksFile,
      } as Todo,
      {
        task: TaskType.Done,
        text: "Done",
        indentation: "            ",
        file: tasksFile,
      } as Todo,
    ]

    const todoFile = createMockFile("TODO.md", "")
    const mockFileService = new MockFileService([todoFile])

    // Act
    const todoService = new TodoService(mockFileService, MOCK_SETTINGS)
    await todoService.saveTodos(todoFile, todos)

    // Assert
    const expected = `- [Tasks.md](/Tasks.md)
\t- [ ] Pending
\t    - [.] In progress
`

    const actual = todoFile.content
    expect(actual).toEqual(expected)
  })

  test("saveTodos formats file link correct", async () => {
    // Arrange
    const folder = createMockFile("Folder", "")
    const tasksFile = createMockFile("Tasks & Porpoises 🐬.md", "", folder)

    const todos = [
      {
        task: TaskType.NotStarted,
        text: "Pending",
        indentation: "",
        file: tasksFile,
      } as Todo,
    ]

    const todoFile = createMockFile("TODO.md", "")
    const mockFileService = new MockFileService([todoFile])

    // Act
    const todoService = new TodoService(mockFileService, MOCK_SETTINGS)
    await todoService.saveTodos(todoFile, todos)

    // Assert
    const expected = `- [Tasks & Porpoises 🐬.md](/Folder/Tasks%20&%20Porpoises%20%F0%9F%90%AC.md)
\t- [ ] Pending
`

    const actual = todoFile.content
    expect(actual).toEqual(expected)
  })

  test("saveTodos sorts task item headers by created time", async () => {
    // Arrange
    const oldFile = createMockFile("Old.md", "")
    const midFile = createMockFile("Mid.md", "")
    const newFile = createMockFile("New.md", "")
    oldFile.stat.ctime = 1
    midFile.stat.ctime = 2
    newFile.stat.ctime = 3

    const todos = [
      {
        task: TaskType.NotStarted,
        text: "New TODO",
        indentation: "",
        file: newFile,
      } as Todo,
      {
        task: TaskType.NotStarted,
        text: "Old TODO",
        indentation: "",
        file: oldFile,
      } as Todo,
      {
        task: TaskType.NotStarted,
        text: "Mid TODO",
        indentation: "",
        file: midFile,
      } as Todo,
    ]

    const todoFile = createMockFile("TODO.md", "")
    const mockFileService = new MockFileService([todoFile])

    // Act
    const todoService = new TodoService(mockFileService, MOCK_SETTINGS)
    await todoService.saveTodos(todoFile, todos)

    // Assert
    const expected = `- [Old.md](/Old.md)
\t- [ ] Old TODO
- [Mid.md](/Mid.md)
\t- [ ] Mid TODO
- [New.md](/New.md)
\t- [ ] New TODO
`

    const actual = todoFile.content
    expect(actual).toEqual(expected)
  })

  test("Whole shebang formats TODO.md correctly with task items nested under normal lists", async () => {
    // Arrange
    const taskFile = createMockFile("Tasks.md", `
- some list
    - more lists
        - [ ] task item
- some list
    - [ ] another task item
        - [ ] nested task item
- [ ] top task item
    - [ ] mid task item
        - [ ] bottom task item
    `)
    const todoFile = createMockFile("TODO.md", "")
    const mockFileService = new MockFileService([taskFile, todoFile])

    // Act
    const todoService = new TodoService(mockFileService, MOCK_SETTINGS)
    const todos = todoService.parseTodos(taskFile.content)
    expect(todos.length).toBe(1)
    todos[0].file = taskFile
    await todoService.saveTodos(todoFile, todos)

    // Assert
    const expected = `- [Tasks.md](/Tasks.md)
\t- [ ] task item
\t- [ ] another task item
\t    - [ ] nested task item
\t - [ ] top task item
\t    - [ ] mid task item
\t        - [ ] bottom task item
`

    const actual = todoFile.content
    expect(actual).toEqual(expected)
  })

})
