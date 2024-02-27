import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface ExtendedTaskListsSettings {
  todoFilename: string;
  excludeFilePattern: string;
  excludeFolderFilename: string;
  includeNotStarted: boolean;
  includeInProgress: boolean;
  includeWontDo: boolean;
  includeDone: boolean;
}

const DEFAULT_SETTINGS: ExtendedTaskListsSettings = {
  todoFilename: "TODO.md",
  excludeFilePattern: "<!-- exclude TODO -->",
  excludeFolderFilename: ".exclude_todos",
  includeNotStarted: true,
  includeInProgress: true,
  includeWontDo: false,
  includeDone: false,
}

export { DEFAULT_SETTINGS, ExtendedTaskListsSettingTab };
export type { ExtendedTaskListsSettings };


interface IPlugin extends Plugin {
  settings: ExtendedTaskListsSettings

  saveSettings(): Promise<void>
}


class ExtendedTaskListsSettingTab extends PluginSettingTab {
  plugin: IPlugin

  constructor(app: App, plugin: IPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this

    containerEl.empty()
    this.containerEl.createEl("h2", { text: "Generated TODO" });

    new Setting(containerEl)
      .setName('TODO filename')
      .addText(text => text
        .setValue(this.plugin.settings.todoFilename)
        .onChange(async (value) => {
          this.plugin.settings.todoFilename = value
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Exclude file pattern')
      .setDesc('A pattern that should be inserted anywhere in a Markdown file to exclude it from the generated TODO file.')
      .addText(text => text
        .setValue(this.plugin.settings.excludeFilePattern)
        .onChange(async (value) => {
          this.plugin.settings.excludeFilePattern = value
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Exclude folder filename')
      .setDesc('The filename to add to a folder to exclude all task lists in it from the generated TODO file. You may prefer to change the default value since dot files (files that start with a ".") do not show up within Obsidian.')
      .addText(text => text
        .setValue(this.plugin.settings.excludeFolderFilename)
        .onChange(async (value) => {
          this.plugin.settings.excludeFolderFilename = value
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Include not started tasks')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeNotStarted)
        .onChange(async (value) => {
          this.plugin.settings.includeNotStarted = value
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Include in progress tasks')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeInProgress)
        .onChange(async (value) => {
          this.plugin.settings.includeInProgress = value
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Include won\'t do tasks')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeWontDo)
        .onChange(async (value) => {
          this.plugin.settings.includeWontDo = value
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Include done tasks')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeDone)
        .onChange(async (value) => {
          this.plugin.settings.includeDone = value
          await this.plugin.saveSettings()
        }))
  }
}
