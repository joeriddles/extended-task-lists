import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface ExtendedMarkdownSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: ExtendedMarkdownSettings = {
	mySetting: 'default'
}

export default class ExtendedMarkdownPlugin extends Plugin {
	settings: ExtendedMarkdownSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		const registerIndeterminateClick = (checkbox: HTMLInputElement) => {
			let handled = false;
			this.registerDomEvent(checkbox, 'click', (evt: MouseEvent) => {
				if (handled) {
					return;
				}

				handled = true;
				checkbox.indeterminate = false;
				checkbox.checked = true;
				evt.stopPropagation();
			});
		}

		const registerWontDoClick = (checkbox: HTMLInputElement, taskItem: HTMLElement) => {
			let handled = false;
			this.registerDomEvent(checkbox, 'click', (evt: MouseEvent) => {
				if (handled) {
					return;
				}

				handled = true;
				checkbox.checked = true;
				checkbox.classList.remove("wont-do");
				taskItem.classList.remove("wont-do");
				evt.stopPropagation();
			});
		}

		this.registerMarkdownPostProcessor((element, context) => {
			const taskItems = element.findAll(".task-list-item");
			for (const taskItem of taskItems) {
				const char = taskItem.dataset.task;
				const checkbox = taskItem.find("input[type='checkbox']") as HTMLInputElement;


				switch (char) {
					case ".":
						checkbox.indeterminate = true;
						registerIndeterminateClick(checkbox);
						break;
					case "~":
						checkbox.classList.add("wont-do");
						taskItem.classList.add("wont-do");
						registerWontDoClick(checkbox, taskItem);
						break;
				}
			}
		});
	}

	// onunload() {

	// }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: ExtendedMarkdownPlugin;

	constructor(app: App, plugin: ExtendedMarkdownPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
