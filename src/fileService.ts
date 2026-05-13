import { FileStats, TFile, Vault } from "obsidian";

interface IFile {
	name: string;
	path: string;
	basename: string;
	parent: IFile | null;
	stat: FileStats;
}

interface IFileService {
	getFileByPath(path: string): Promise<IFile | null>;
	getFiles(): Promise<IFile[]>;
	readFile(file: IFile): Promise<string>;
	updateFile(file: IFile, data: string): Promise<void>;
	checkExists(filepath: string): Promise<boolean>;
}

class VaultFileService implements VaultFileService {
	vault: Vault;

	constructor(vault: Vault) {
		this.vault = vault;
	}

	async getFileByPath(path: string): Promise<IFile | null> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		return file as IFile;
	}

	async getFiles(): Promise<IFile[]> {
		return this.vault.getMarkdownFiles() as IFile[];
	}

	async readFile(file: IFile): Promise<string> {
		if (file instanceof TFile) {
			return await this.vault.cachedRead(file);
		}
		return Promise.reject(new Error("not a TFile"));
	}

	async updateFile(file: IFile, data: string): Promise<void> {
		if (file instanceof TFile) {
			await this.vault.modify(file, data);
		}
		return Promise.reject(new Error("not a TFile"));
	}

	async checkExists(filepath: string): Promise<boolean> {
		return await this.vault.adapter.exists(filepath);
	}
}

export { VaultFileService };
export type { IFile, IFileService };
