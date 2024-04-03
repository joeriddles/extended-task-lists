/**
 * TypeScript mirror of https://github.com/joeriddles/notes
 */

import { ExtendedTaskListsSettings } from 'src/settings'
import { IFile, IFileService } from "./fileService"

enum TaskType {
  NotStarted = " ",
  InProgress = ".",
  WontDo = "~",
  Done = "x",
}

interface TodoFile {
  file: IFile
  contents: string
}

interface Todo {
  task: TaskType
  text: string
  lineno: number
  indentation: string
  file: IFile
}

interface IndexMatch {
  match: RegExpMatchArray
  index: number
}

const TODO_PATTERN = /^(?<indentation>\s*)-\s?\[(?<task>.)\]\s+(?<text>.*)$/

class TodoService {
  private fileService: IFileService
  private settings: ExtendedTaskListsSettings
  private excludeCache: { [path: string]: boolean }

  constructor(fileService: IFileService, settings: ExtendedTaskListsSettings) {
    this.fileService = fileService
    this.settings = settings
    this.excludeCache = {}
  }

  /**
   * Find all the non-excluded Markdown files that _may_ contain task items.
   */
  async findTodosFiles(): Promise<TodoFile[]> {
    const markdownFiles = await this.fileService.getFiles()
    const shouldExcludeFiles = await Promise.all(markdownFiles.map(async file =>
      await this.getShouldExcludeFile(file)
    ))
    const filteredMarkdownFiles = markdownFiles.filter((_, index) => !shouldExcludeFiles[index])

    let todoFiles = await Promise.all(filteredMarkdownFiles.map(async file => {
      const contents = await this.fileService.readFile(file)
      return { file, contents } as TodoFile
    }))

    todoFiles = todoFiles.filter(todoFile =>
      !todoFile.contents
        .split(/[\r\n]+/)
        .some(line => line.trim() === this.settings.excludeFilePattern)
    )
    return todoFiles
  }

  /**
   * Parse all the task items from the string
   */
  parseTodos(contents: string): Todo[] {
    const lines = contents.split(/[\r]?[\n]/)
    const matchesAndIndices = lines
      .map((line, index) => {
        const match = line.match(TODO_PATTERN)
        return { match, index } as IndexMatch
      })
      .filter(indexMatch => indexMatch.match != null)

    const todos = matchesAndIndices.map(indexMatch => {
      const lineno = indexMatch.index
      const task = indexMatch.match.groups?.task
      const text = indexMatch.match.groups?.text
      const indentation = indexMatch.match.groups?.indentation
      return { task, text, indentation, lineno } as Todo
    })

    const todoToPrevSibling: Map<Todo, Todo | null> = new Map()
    todos.forEach(todo => {
      const prevSibling = todos.find(t => t.lineno === todo.lineno - 1) || null
      todoToPrevSibling.set(todo, prevSibling)
    })

    const kvps = [...todoToPrevSibling]

    kvps.filter(kvp => kvp[1] == null)
      .forEach(kvp => kvp[0].indentation = "")

    // Is the task item nested under the previous task item?
    kvps.filter(kvp => kvp[1] != null && kvp[0].indentation.length > kvp[1].indentation.length)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .forEach(kvp => kvp[0].indentation = kvp[1]!.indentation + "    ")

    return todos
  }

  /**
   * Save the task items to the TODO file
   */
  async saveTodos(todoFile: IFile, todos: Todo[]): Promise<void> {
    let data = ""

    // Sort oldest-to-newest
    todos.sort((a, b) => a.file.stat.ctime - b.file.stat.ctime)

    // Exclude finished tasks
    todos = todos.filter(todo =>
      (todo.task === TaskType.NotStarted && this.settings.includeNotStarted)
      || (todo.task === TaskType.InProgress && this.settings.includeInProgress)
      || (todo.task === TaskType.WontDo && this.settings.includeWontDo)
      || (todo.task === TaskType.Done && this.settings.includeDone)
    )

    // Group by file
    const todosByFile: Map<IFile, Todo[]> = new Map()
    todos.forEach(todo => {
      if (!todosByFile.get(todo.file)) {
        todosByFile.set(todo.file, [])
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      todosByFile.get(todo.file)!.push(todo)
    })

    todosByFile.forEach((todos, file) => {
      const urlEncodedFilePath = encodeURI(file.path)

      const heading = this.settings.useFullFilepath
        ? `- [${file.path}](${urlEncodedFilePath})\n`
        : `- [${file.basename}](${urlEncodedFilePath})\n`

      data += heading

      todos.forEach(todo => {
        data += `\t${todo.indentation}- [${todo.task}] ${todo.text}\n`
      })
    })

    this.fileService.updateFile(todoFile, data)
  }

  private async getShouldExcludeFile(file: IFile): Promise<boolean> {
    const isTodoFile = file.name == this.settings.todoFilename
    if (isTodoFile) {
      return true
    }

    if (this.excludeCache[file.path]) {
      return true
    }

    let parentPath = file.parent?.path ?? ""
    if (!parentPath) {
      return false
    }

    if (parentPath.at(0) !== "/") {
      parentPath = "/" + parentPath
    }
    let excludeFolderFilepath = parentPath.endsWith("/")
      ? parentPath + this.settings.excludeFolderFilename
      : `${parentPath}/${this.settings.excludeFolderFilename}`

    // Short-circuit if a cached value for the folder is found
    if (this.excludeCache[parentPath] != null) {
      return this.excludeCache[parentPath]
    }

    excludeFolderFilepath = excludeFolderFilepath.replace("//", "/")
    let isFolderExcluded = await this.fileService.checkExists(excludeFolderFilepath)

    // Recurse upwards to check if the file is deeply nested in an excluded folder
    if (!isFolderExcluded && file.parent) {
      isFolderExcluded = await this.getShouldExcludeFile(file.parent)
    }

    // Cache checking this folder
    if (parentPath) {
      this.excludeCache[parentPath] = isFolderExcluded
    }

    return isFolderExcluded
  }
}


export default TodoService
export { TaskType }
export type { Todo, TodoFile }

