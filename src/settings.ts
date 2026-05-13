import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

interface ExtendedTaskListsSettings {
	todoFilename: string;
	useFullFilepath: boolean;
	useHierarchy: boolean;
	enableNestedTodos: boolean;
	excludeNestedFromParent: boolean;
	excludeFilePattern: string;
	excludeFolderFilename: string;
	excludeRegionBegin: string;
	excludeRegionEnd: string;
	includeNotStarted: boolean;
	includeInProgress: boolean;
	includeWontDo: boolean;
	includeDone: boolean;
}

const DEFAULT_SETTINGS: ExtendedTaskListsSettings = {
	todoFilename: "TODO.md",
	useFullFilepath: false,
	useHierarchy: false,
	enableNestedTodos: false,
	excludeNestedFromParent: true,
	excludeFilePattern: "<!-- exclude TODO -->",
	excludeFolderFilename: ".exclude_todos",
	excludeRegionBegin: "%% exclude: start %%",
	excludeRegionEnd: "%% exclude: end %%",
	includeNotStarted: true,
	includeInProgress: true,
	includeWontDo: false,
	includeDone: false,
};

interface IPlugin extends Plugin {
	settings: ExtendedTaskListsSettings;

	saveSettings(): Promise<void>;
}

class ExtendedTaskListsSettingTab extends PluginSettingTab {
	plugin: IPlugin;

	constructor(app: App, plugin: IPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		new Setting(containerEl).setName("Generated TODO").setHeading();

		new Setting(containerEl).setName("TODO filename").addText((text) =>
			text
				.setValue(this.plugin.settings.todoFilename)
				.onChange(async (value) => {
					this.plugin.settings.todoFilename = value;
					await this.plugin.saveSettings();
				}),
		);

		new Setting(containerEl)
			.setName("Use full filepath")
			.setDesc(
				"If checked, the full Vault filepath is used for the label of grouped task items in the generated TODO file",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useFullFilepath)
					.onChange(async (value) => {
						this.plugin.settings.useFullFilepath = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Use hierarchy")
			.setDesc(
				"If checked, task items in the generated TODO file are organized according to the folder structure of the Vault.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useHierarchy)
					.onChange(async (value) => {
						this.plugin.settings.useHierarchy = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Enable nested TODOs")
			.setDesc(
				"When enabled, any TODO file you create in a subfolder will be populated with task items from that folder and its subfolders.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableNestedTodos)
					.onChange(async (value) => {
						this.plugin.settings.enableNestedTodos = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Exclude nested from parent")
			.setDesc(
				"When enabled, task items that appear in a nested TODO file are excluded from ancestor TODO files to avoid duplication.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.excludeNestedFromParent)
					.onChange(async (value) => {
						this.plugin.settings.excludeNestedFromParent = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Excludes").setHeading();

		new Setting(containerEl)
			.setName("Exclude file pattern")
			.setDesc(
				"A pattern that should be inserted anywhere in a Markdown file to exclude it from the generated TODO file.",
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.excludeFilePattern)
					.onChange(async (value) => {
						this.plugin.settings.excludeFilePattern = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Exclude folder filename")
			.setDesc(
				'The filename to add to a folder to exclude all task lists in it from the generated TODO file. You may prefer to change the default value since dot files (files that start with a ".") do not show up within Obsidian.',
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.excludeFolderFilename)
					.onChange(async (value) => {
						this.plugin.settings.excludeFolderFilename = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Exclude region begin")
			.setDesc(
				"A line matching this pattern marks the start of a region whose task items are excluded from the generated TODO file.",
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.excludeRegionBegin)
					.onChange(async (value) => {
						this.plugin.settings.excludeRegionBegin = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Exclude region end")
			.setDesc(
				"A line matching this pattern marks the end of an excluded region.",
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.excludeRegionEnd)
					.onChange(async (value) => {
						this.plugin.settings.excludeRegionEnd = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Includes").setHeading();

		new Setting(containerEl)
			.setName("Include not started tasks")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeNotStarted)
					.onChange(async (value) => {
						this.plugin.settings.includeNotStarted = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Include in progress tasks")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeInProgress)
					.onChange(async (value) => {
						this.plugin.settings.includeInProgress = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Include won't do tasks")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeWontDo)
					.onChange(async (value) => {
						this.plugin.settings.includeWontDo = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Include done tasks")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeDone)
					.onChange(async (value) => {
						this.plugin.settings.includeDone = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}

export { DEFAULT_SETTINGS, ExtendedTaskListsSettingTab };
export type { ExtendedTaskListsSettings };
