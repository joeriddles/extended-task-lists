/**
 * TypeScript mirror of https://github.com/joeriddles/notes
 */

import { TAbstractFile, TFile, Vault, normalizePath } from "obsidian";
import { ExtendedTaskListsSettings } from 'settings';

enum TaskType {
  NotStarted = " ",
  InProgress = ".",
  WontDo = "~",
  Done = "x",
}

interface TodoFile {
  file: TFile
  contents: string
}

interface Todo {
  task: TaskType
  text: string
  file: TFile
}

const TODO_PATTERN = /^\s*-\s?\[(?<task>.)\]\s+(?<text>.*)$/

class TodoService {
  vault: Vault
  settings: ExtendedTaskListsSettings
  private excludeCache: { [path: string]: boolean }

  constructor(vault: Vault, settings: ExtendedTaskListsSettings) {
    this.vault = vault
    this.settings = settings
    this.excludeCache = {}
  }

  async findTodosFiles(): Promise<TodoFile[]> {
    const markdownFiles = this.vault.getMarkdownFiles()
    const shouldExcludeFiles = await Promise.all(markdownFiles.map(async file =>
      await this.getShouldExcludeFile(file)
    ))
    const filteredMarkdownFiles = markdownFiles.filter((_, index) => !shouldExcludeFiles[index])

    let todoFiles = await Promise.all(filteredMarkdownFiles.map(async file => {
      const contents = await this.vault.cachedRead(file)
      return { file, contents } as TodoFile
    }))

    todoFiles = todoFiles.filter(todoFile =>
      !todoFile.contents
        .split(/[\r\n]+/)
        .some(line => line.trim() === this.settings.excludeFilePattern)
    )
    return todoFiles
  }

  parseTodos({ file, contents }: TodoFile): Todo[] {
    const lines = contents.split(/[\r\n]+/)
    const matches = lines
      .map(line => line.match(TODO_PATTERN))
      .filter(match => match != null) as RegExpMatchArray[]
    const todos = matches.map(match => {
      const task = match.groups?.task
      const text = match.groups?.text
      return { task, text, file } as Todo
    })
    return todos
  }

  async saveTodos(file: TFile, todos: Todo[]): Promise<void> {
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
    const todosByFile: Map<TFile, Todo[]> = new Map();
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
        data += `    - [${todo.task}] ${todo.text}\n`
      })
    })

    file.vault.modify(file, data)
  }

  private async getShouldExcludeFile(file: TAbstractFile): Promise<boolean> {
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

    excludeFolderFilepath = normalizePath(excludeFolderFilepath)
    let isFolderExcluded = await this.vault.adapter.exists(excludeFolderFilepath)

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
export type { Todo };

