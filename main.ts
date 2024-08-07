import { Plugin, TFile, Vault } from 'obsidian';
import { IFile, VaultFileService } from 'src/fileService';
import { DEFAULT_SETTINGS, ExtendedTaskListsSettingTab, ExtendedTaskListsSettings } from 'src/settings';
import TodoService, { Todo } from 'src/todoService';

export default class ExtendedTaskListsPlugin extends Plugin {
	settings: ExtendedTaskListsSettings

	async onload() {
		await this.loadSettings()

		// ignore create events on vault load
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.vault.on("create", this.updateTodoFile))
		})

		// TODO(joeriddles): only re-run updateTodo for changed file(s)
		this.registerEvent(this.app.vault.on("delete", this.updateTodoFile))
		this.registerEvent(this.app.vault.on("rename", this.updateTodoFile))

		this.registerEvent(this.app.vault.on("modify", async (file) => {
			if (file.name !== this.settings.todoFilename || !(file instanceof TFile)) {
				await this.updateTodoFile();
				return
			}

			const hasChanges = await this.onTodoFileUpdated(file);
			if (hasChanges) {
				await this.updateTodoFile();
			}
		}))

		this.addCommand({
			id: 'update-todo',
			name: 'Update TODO',
			callback: this.updateTodoFile,
		})

		this.addSettingTab(new ExtendedTaskListsSettingTab(this.app, this))

		this.registerMarkdownPostProcessor((element, context) => {
			const taskItems = element.findAll(".task-list-item")
			for (const taskItem of taskItems) {
				const char = taskItem.dataset.task
				const checkbox = taskItem.find("input[type='checkbox']") as HTMLInputElement

				switch (char) {
					case ".":
						checkbox.indeterminate = true
						registerIndeterminateClick(checkbox)
						break
					case "~":
						checkbox.classList.add("wont-do")
						taskItem.classList.add("wont-do")
						registerWontDoClick(checkbox, taskItem)
						break
				}
			}
		})

		const registerIndeterminateClick = (checkbox: HTMLInputElement) => {
			let handled = false
			this.registerDomEvent(checkbox, 'click', (evt: MouseEvent) => {
				if (handled) {
					return
				}

				handled = true
				checkbox.indeterminate = false
				checkbox.checked = true
				evt.stopPropagation()
			})
		}

		const registerWontDoClick = (checkbox: HTMLInputElement, taskItem: HTMLElement) => {
			let handled = false
			this.registerDomEvent(checkbox, 'click', (evt: MouseEvent) => {
				if (handled) {
					return
				}

				handled = true
				checkbox.checked = true
				checkbox.classList.remove("wont-do")
				taskItem.classList.remove("wont-do")
				evt.stopPropagation()
			})
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}

	updateTodoFile = async () => {
		const vault = this.app.vault
		const fileService = new VaultFileService(vault)
		const service = new TodoService(fileService, this.settings)
		const todoFiles = await service.findTodosFiles()
		const todos: Todo[] = todoFiles
			.map(todoFile => {
				const todos = service.parseTodos(todoFile.contents)
				todos.forEach(todo => todo.file = todoFile.file)
				return todos
			})
			.reduce((prev, cur) => prev.concat(cur), [])
		const todoFile = await this.getOrCreateTodoFile(vault);
		await service.saveTodos(todoFile as IFile, todos)
	}

	onTodoFileUpdated = async (todoFile: TFile): Promise<boolean> => {
		const vault = this.app.vault
		const fileService = new VaultFileService(vault)
		const contents = await fileService.readFile(todoFile as IFile)
		const service = new TodoService(fileService, this.settings)
		const todosByFilePath = service.parseTodoFile(contents)

		const hasUpdates = false
		todosByFilePath.forEach(async (todos, filepath) => {
			const includedTaskTypes = service.getIncludedTaskTypes()
			const updatedTodos = todos.filter(todo => !includedTaskTypes.has(todo.task))

			if (updatedTodos.length === 0) return

			const file = await fileService.getFileByPath(filepath)
			if (file == null) return

			const fileContent = await fileService.readFile(file)
			const newFileContent = await service.updateTodos(fileContent, updatedTodos)
			await fileService.updateFile(file, newFileContent)
		})

		return hasUpdates
	}

	getOrCreateTodoFile = async (vault: Vault): Promise<TFile> => {
		let todoFile: TFile
		try {
			todoFile = await vault.create(this.settings.todoFilename, "")
		} catch (e) {
			const todoFileOrNull = vault.getAbstractFileByPath(this.settings.todoFilename)
			if (todoFileOrNull == null) {
				throw new Error(`Could not get or create the TODO file: ${this.settings.todoFilename}`)
			} else if (!(todoFileOrNull instanceof TFile)) {
				throw new Error(`The retrieved TODO file is a folder: ${this.settings.todoFilename}`)
			}
			todoFile = todoFileOrNull
		}
		return todoFile
	}
}

