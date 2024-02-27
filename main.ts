import { Plugin, TFile, Vault } from 'obsidian';
import { DEFAULT_SETTINGS, ExtendedTaskListsSettingTab, ExtendedTaskListsSettings } from 'settings';
import TodoService, { Todo } from './findTodos';

export default class ExtendedTaskListsPlugin extends Plugin {
	settings: ExtendedTaskListsSettings

	async onload() {
		await this.loadSettings()

		this.addCommand({
			id: 'update-todo',
			name: 'Update TODO',
			callback: this.updateTodo,
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

	updateTodo = async () => {
		const vault = this.app.vault
		const service = new TodoService(vault, this.settings)
		const todoFiles = await service.findTodosFiles()
		const todos: Todo[] = todoFiles
			.map(todoFile => service.parseTodos(todoFile))
			.reduce((prev, cur) => prev.concat(cur), [])
		const todoFile = await this.getOrCreateTodoFile(vault);
		await service.saveTodos(todoFile, todos)
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

