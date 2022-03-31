import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { mountComponentWithUid, initUnigraphEmbed } from 'unigraph-dev-explorer/lib/index'

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'localhost'
}

function parsePostProcess (parsed: any[], replaced: any[]) {
	let maxHeading = 1;
	parsed.forEach(el => {
		if (el.heading > maxHeading) maxHeading = el.heading;
	})
	return parsed.map(el => {
		let finText: string = el.text.replace(/\n/g, ' ');
		let hasMatch = true;
		while (hasMatch) {
			hasMatch = false;
			const matches = replaced.map(el => `[[${el.from}]]`).map((str, idx) => [replaced[idx], finText.indexOf(str) !== -1]);
			// console.log(matches);
			matches.forEach(([match, hasMatch]) => {
				if (!hasMatch) return;
				hasMatch = true;
				finText = finText.replace(`[[${match.from}]]`, `[[${match.to}|${match.from}]]`);
			})
		}
		return el.heading === 1 ? '' : !el.text.startsWith('```unigraph\n') 
			? `${'  '.repeat(el.heading - 1)}${el.asOutline ? "- " : ''}${finText}` 
			: finText
	}).join('\n')
}

function parseNotePage (note: any, parsedLists: any[][]) {

	const parsedList: any[] = [];

	function parseNoteToMarkdown (note: any, heading: number = 1, parsed: any[] = [], asOutline = true) {
		const name = note.get('text').as('primitive');
		parsed.push({
			text: note.getType() === '$/schema/note_block' 
				? name 
				: `\`\`\`unigraph\n${note._value.content._value.uid}\n\`\`\``,
			heading,
			asOutline,
		});
		(note.get('children')?.['_value['] || [])
			.sort((a: any, b: any) => a?.['_index']?.['_value.#i'] - b?.['_index']?.['_value.#i'])
			.map((child: any) => {
				if (child?._value?.type?.['unigraph.id'] === '$/schema/subentity') {
					// console.log(note, child);
					const childNote = note.__proto__.constructor(child?._value?._value);
					parseNoteToMarkdown(childNote, asOutline ? heading + 1 : heading, parsed, note.get('children')?._displayAs !== "paragraph");
				} else if (child?._value?.type?.['unigraph.id'] === '$/schema/interface/semantic'
					&& child?._value?._value?.type?.['unigraph.id'] === '$/schema/note_block'
					&& child?._value?._value?._hide !== true
				) {
					parseNotePage(note.__proto__.constructor(child?._value?._value), parsedLists);
				}
		})
	}
	
	parseNoteToMarkdown(note, 1, parsedList);
	parsedLists.push(parsedList);

}

function parseNotesAsLists (notes: any[]) {
	
	const lists: any[][] = [];
	notes.forEach(el => parseNotePage(el, lists));

	return lists;
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
					const escapedTitles: any[] = [];
					const pages = Object.entries(
						Object.fromEntries(parseNotesAsLists(objs)
							.map((pg) => {
								if (pg[0].text === 'publish.css') return [pg[0].text, pg]
								const newText = pg[0].text.replace(/[:\/\|\.]/g, '_');
								if (newText !== pg[0].text) escapedTitles.push({from: pg[0].text, to: newText})
								return [newText + '.md', pg]
							}))
					)
					// console.log(pages, escapedTitles);
					Promise.all(pages.map(async ([path, mkd]: any) => {
						const text = parsePostProcess(mkd, escapedTitles);
						try {
							await this.app.vault.create(path, text)
						} catch (e: any) {
							if (e?.message.includes('File already exists')) {
								const file = this.app.vault.getAbstractFileByPath(path);
								await this.app.vault.modify(file as TFile, text).catch((e: any) => {
									console.log(e, text, path, file)
								});
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
			// console.log(div);
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
					window.localStorage.removeItem('userSettings')
					await this.plugin.saveSettings();
				}));
	}
}
