/**
 * TypeScript mirror of https://github.com/joeriddles/notes
 */

import { TFile, Vault } from "obsidian";
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
  settings: ExtendedTaskListsSettings

  constructor(settings: ExtendedTaskListsSettings) {
    this.settings = settings
  }

  async findTodosFiles(vault: Vault): Promise<TodoFile[]> {
    const todoPromises = vault
      .getMarkdownFiles()
      .filter(file => file.name != this.settings.todoFilename)
      .map(async file => {
        const contents = await vault.cachedRead(file)
        return { file, contents } as TodoFile
      })
    return await Promise.all(todoPromises)
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
    todos.sort((a, b) => a.file.stat.mtime - b.file.stat.mtime)

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
      data += `- [${file.basename}](${urlEncodedFilePath})\n`
      todos.forEach(todo => {
        data += `    - [${todo.task}] ${todo.text}\n`
      })
    })

    file.vault.modify(file, data)
  }
}


export default TodoService
export type { Todo };

