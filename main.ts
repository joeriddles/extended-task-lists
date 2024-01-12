import { Plugin } from 'obsidian';

export default class ExtendedTaskListsPlugin extends Plugin {

	async onload() {

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
	}
}
