interface ExtendedTaskListsSettings {
  todoFilename: string;
  includeNotStarted: boolean;
  includeInProgress: boolean;
  includeWontDo: boolean;
  includeDone: boolean;
}

const DEFAULT_SETTINGS: ExtendedTaskListsSettings = {
  todoFilename: "TODO.md",
  includeNotStarted: true,
  includeInProgress: true,
  includeWontDo: false,
  includeDone: false,
}

export { DEFAULT_SETTINGS };
export type { ExtendedTaskListsSettings };

