import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { mountComponentWithUid, initUnigraphEmbed } from 'unigraph-dev-explorer/lib/index'

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'localhost'
}

function parseNoteToMarkdown (note: any, heading: number = 1, parsed: any[] = []) {
	const name = note.get('text').as('primitive');
	parsed.push({
		text: note.getType() === '$/schema/note_block' 
			? name 
			: `\`\`\`unigraph\n${note._value.content._value.uid}\n\`\`\``,
		heading
	});
	(note.get('children')?.['_value['] || [])
		.sort((a: any, b: any) => a?.['_index']?.['_value.#i'] - b?.['_index']?.['_value.#i'])
		.map((child: any) => {
			if (child?._value?.type?.['unigraph.id'] === '$/schema/subentity') {
				console.log(note, child);
				const childNote = note.__proto__.constructor(child?._value?._value);
				parseNoteToMarkdown(childNote, heading + 1, parsed);
		}
	})
}

function parsePostProcess (parsed: any[]) {
	let maxHeading = 1;
	parsed.forEach(el => {
		if (el.heading > maxHeading) maxHeading = el.heading;
	})
	return parsed.map(el => {
		return el.heading < maxHeading && !el.text.startsWith('```unigraph\n') 
			? `${'#'.repeat(el.heading)} ${el.text}` 
			: el.text
	}).join('\n')
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();
		initUnigraphEmbed(this.settings.mySetting);
		//console.log(mountComponentWithUid)

		setTimeout(() => {
			// Unigraph ready, now do things
			(window as any).unigraph.startSyncListen('$/entity/obsidian_sync_resource', 'UnigraphTest');

			(window as any).unigraph.backendConnection.current.addEventListener('message', (message: MessageEvent) => {
				const data = message.data;
				let parsed;
				try {
					parsed = JSON.parse(data);
					if (parsed.type !== 'sync_updated') parsed = undefined;
				} catch (e) {}
				if (!parsed) return;
				const uids: string[] = parsed.result;
				// TODO: sync those things now
				(window as any).unigraph.getObject(uids).then((objs: any[]) => {
					Promise.all(objs.map(async (note: any) => {
						const title = note.get('text').as('primitive');
						const path = title + '.md';
						const mkd: any[] = [];
						parseNoteToMarkdown(note, 1, mkd);
						const text = parsePostProcess(mkd);
						try {
							await this.app.vault.create(path, text)
						} catch (e: any) {
							if (e?.message.includes('File already exists')) {
								const file = this.app.vault.getAbstractFileByPath(path);
								await this.app.vault.modify(file as TFile, text);
							}
						}
						return true;
					})).then(() => {
						(window as any).unigraph.acknowledgeSync('$/entity/obsidian_sync_resource', 'UnigraphTest', uids)
					})
				});
			})
		}, 2000)

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor("unigraph", (source, el, ctx) => {
			/*const rows = source.split("\n").filter((row) => row.length > 0);
	  
			const table = el.createEl("table");
			const body = table.createEl("tbody");
	  
			for (let i = 0; i < rows.length; i++) {
			  const cols = rows[i].split(",");
	  
			  const row = body.createEl("tr");
	  
			  for (let j = 0; j < cols.length; j++) {
				row.createEl("td", { text: cols[j] });
			  }
			}*/
			const div = el.createDiv();
			div.id = "unigraph-entity-" + source;
			console.log(div);
			setTimeout(() => {
				mountComponentWithUid(source, "unigraph-entity-" + source)
			}, 0)
		});
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings'});

		new Setting(containerEl)
			.setName('Hostname')
			.setDesc('Hostname of the Unigraph server to sync with')
			.addText(text => text
				.setPlaceholder('localhost')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
