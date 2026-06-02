import { App, Plugin, PluginSettingTab, Setting, Platform, Notice } from 'obsidian';

// ---------------------------------------------------------------------------
// Types & Settings
// ---------------------------------------------------------------------------

type TranslucentBgMaterial = 'none' | 'mica' | 'acrylic' | 'tabbed';

interface TranslucentBgSettings {
    material: TranslucentBgMaterial;
    lightTintColor: string;
    lightTintOpacity: number;
    darkTintColor: string;
    darkTintOpacity: number;
    /** When true, --workspace-background-translucent opacity is driven by the theme's :root variables. */
    themeHandlesOpacity: boolean;
    /** When true, the overlay uses --background-secondary + the theme's opacity vars instead of the plugin's color pickers. */
    themeHandlesTint: boolean;
}

const DEFAULT_SETTINGS: TranslucentBgSettings = {
    material: 'acrylic',
    lightTintColor: '#ffffff',
    lightTintOpacity: 0.35,
    darkTintColor: '#1e1e1e',
    darkTintOpacity: 0.45,
    themeHandlesOpacity: false,
    themeHandlesTint: false,
};

const OVERLAY_ID = 'translucent-bg-overlay';

interface ElectronBrowserWindow {
    setBackgroundMaterial(material: string): void;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default class TranslucentBgPlugin extends Plugin {
    settings: TranslucentBgSettings;
    electronWindow: ElectronBrowserWindow | null = null;
    private themeObserver: MutationObserver | null = null;
    private fullscreenHandler: (() => void) | null = null;

    async onload() {
        await this.loadSettings();

        if (!Platform.isWin) {
            console.warn('Translucent BG: Windows only — plugin inactive on this platform.');
            return;
        }

        this.electronWindow = this.getElectronWindow();
        if (!this.electronWindow) {
            new Notice('Translucent BG: Could not access Electron window. Please report this issue.');
            return;
        }

        this.addSettingTab(new TranslucentBgSettingTab(this.app, this));

        this.enableTranslucency();
        this.applyMaterial(this.settings.material);
        this.injectOverlay();
        this.updateOverlayStyle();
        this.observeThemeChanges();

        this.fullscreenHandler = () => this.updateOverlayStyle();
        document.addEventListener('fullscreenchange', this.fullscreenHandler);

        this.addCommand({
            id: 'cycle-material',
            name: 'Cycle background material',
            callback: () => this.cycleMaterial(),
        });

        this.addCommand({
            id: 'open-settings',
            name: 'Open Translucent BG settings',
            callback: () => {
                // @ts-ignore
                this.app.setting.open();
                // @ts-ignore
                this.app.setting.openTabById(this.manifest.id);
            },
        });

        this.addRibbonIcon('layers', 'Translucent BG: cycle material', () => this.cycleMaterial());
    }

    onunload() {
        if (!Platform.isWin) return;

        try {
            this.electronWindow?.setBackgroundMaterial?.('none');
        } catch {
            // Window may already be closing.
        }

        document.body.classList.remove('is-translucent');
        document.body.classList.remove('translucent-bg-enabled');
        document.body.classList.remove('translucent-bg-theme-opacity');
        document.body.removeAttribute('data-tbg-material');
        document.body.style.removeProperty('--workspace-background-translucent');
        document.body.style.removeProperty('--titlebar-background');
        document.body.style.removeProperty('--titlebar-background-focused');
        document.body.style.removeProperty('--workspace-split-bg');
        document.body.style.removeProperty('--tbg-tint-base');
        document.body.style.removeProperty('--tbg-tint-opacity');

        document.getElementById(OVERLAY_ID)?.remove();

        this.themeObserver?.disconnect();
        this.themeObserver = null;

        if (this.fullscreenHandler) {
            document.removeEventListener('fullscreenchange', this.fullscreenHandler);
            this.fullscreenHandler = null;
        }
    }

    // -----------------------------------------------------------------------
    // Settings
    // -----------------------------------------------------------------------

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) ?? {});
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // -----------------------------------------------------------------------
    // Material
    // -----------------------------------------------------------------------

    applyMaterial(material: TranslucentBgMaterial) {
        if (!this.electronWindow?.setBackgroundMaterial) {
            new Notice('Translucent BG: setBackgroundMaterial unavailable — Electron version may be too old.');
            return;
        }
        try {
            this.electronWindow.setBackgroundMaterial(material);
            document.body.setAttribute('data-tbg-material', material);
        } catch (e) {
            console.error('Translucent BG: failed to apply material', e);
            new Notice(`Translucent BG: failed to apply '${material}'.`);
        }
    }

    async cycleMaterial() {
        const order: TranslucentBgMaterial[] = ['mica', 'acrylic', 'tabbed', 'none'];
        const idx = order.indexOf(this.settings.material);
        const next = order[(idx + 1) % order.length];
        this.settings.material = next;
        this.applyMaterial(next);
        this.updateOverlayStyle();
        await this.saveSettings();
        new Notice(`Translucent BG: material = ${next}`);
    }

    // -----------------------------------------------------------------------
    // Translucency
    // -----------------------------------------------------------------------

    private enableTranslucency() {
        document.body.classList.add('is-translucent');
        document.body.classList.add('translucent-bg-enabled');
        document.body.style.setProperty('--workspace-background-translucent', 'transparent', 'important');
        document.body.style.setProperty('--titlebar-background', 'transparent', 'important');
        document.body.style.setProperty('--titlebar-background-focused', 'transparent', 'important');
        document.body.style.setProperty('--workspace-split-bg', 'transparent');
    }

    // -----------------------------------------------------------------------
    // Overlay
    // -----------------------------------------------------------------------

    private injectOverlay() {
        if (document.getElementById(OVERLAY_ID)) return;
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.classList.add('translucent-bg-overlay');
        document.body.prepend(overlay);
    }

    updateOverlayStyle() {
        this.themeObserver?.disconnect();

        const isDark = document.body.classList.contains('theme-dark');
        const isFullscreen = document.body.classList.contains('is-fullscreen') || !!document.fullscreenElement;
        const forceOpaque = isFullscreen || this.settings.material === 'none';

        // --- Tint overlay ---
        if (this.settings.themeHandlesTint) {
            document.body.style.setProperty('--tbg-tint-base', 'var(--background-secondary)');
        } else {
            const color = isDark ? this.settings.darkTintColor : this.settings.lightTintColor;
            document.body.style.setProperty('--tbg-tint-base', color);
        }

        if (forceOpaque) {
            document.body.style.setProperty('--tbg-tint-opacity', '1');
        } else if (this.settings.themeHandlesOpacity) {
            const opacityVar = isDark
                ? 'var(--translucent-dark-opacity, 0.5)'
                : 'var(--translucent-light-opacity, 0.5)';
            document.body.style.setProperty('--tbg-tint-opacity', opacityVar);
        } else {
            const alpha = isDark ? this.settings.darkTintOpacity : this.settings.lightTintOpacity;
            document.body.style.setProperty('--tbg-tint-opacity', String(alpha));
        }

        if (forceOpaque) {
            document.body.classList.remove('translucent-bg-theme-opacity');
            document.body.style.setProperty('--workspace-background-translucent', 'transparent', 'important');
        } else if (this.settings.themeHandlesOpacity && this.settings.themeHandlesTint) {
            const opacityVar = isDark
                ? 'var(--translucent-dark-opacity, 50%)'
                : 'var(--translucent-light-opacity, 50%)';
            document.body.classList.add('translucent-bg-theme-opacity');
            document.body.style.setProperty(
                '--workspace-background-translucent',
                `rgb(from var(--background-secondary) r g b / ${opacityVar})`,
                'important'
            );
        } else {
            document.body.classList.remove('translucent-bg-theme-opacity');
            document.body.style.setProperty('--workspace-background-translucent', 'transparent', 'important');
        }

        this.themeObserver?.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    // -----------------------------------------------------------------------
    // Theme observer
    // -----------------------------------------------------------------------

    private observeThemeChanges() {
        this.themeObserver?.disconnect();
        this.themeObserver = new MutationObserver(() => this.updateOverlayStyle());
        this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    // -----------------------------------------------------------------------
    // Electron window
    // -----------------------------------------------------------------------

    private getElectronWindow(): ElectronBrowserWindow | null {
        try {
            // @ts-ignore
            const electron = window.electron ?? (window as any).require?.('electron');
            // @ts-ignore
            return electron?.remote?.getCurrentWindow?.()
                // @ts-ignore
                ?? electron?.getCurrentWindow?.()
                // @ts-ignore
                ?? require('@electron/remote')?.getCurrentWindow?.();
        } catch {
            return null;
        }
    }
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

class TranslucentBgSettingTab extends PluginSettingTab {
    plugin: TranslucentBgPlugin;

    constructor(app: App, plugin: TranslucentBgPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Translucent BG' });
        containerEl.createEl('p', {
            text: 'Apply Windows 11 background materials (Mica, Acrylic) with a theme-aware tint overlay. Window dragging is preserved via the titlebar.',
            cls: 'setting-item-description',
        });

        new Setting(containerEl)
            .setName('Background material')
            .setDesc(
                'Mica: subtle texture from the desktop wallpaper, energy-efficient. ' +
                'Acrylic: stronger acrylic blur with tint. ' +
                'Tabbed: Mica variant for tabbed app windows. ' +
                'None: disables the effect entirely.'
            )
            .addDropdown((dd) =>
                dd
                    .addOption('mica',    'Mica')
                    .addOption('acrylic', 'Acrylic (recommended)')
                    .addOption('tabbed',  'Tabbed')
                    .addOption('none',    'None (disable)')
                    .setValue(this.plugin.settings.material)
                    .onChange(async (value: TranslucentBgMaterial) => {
                        this.plugin.settings.material = value;
                        this.plugin.applyMaterial(value);
                        this.plugin.updateOverlayStyle();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Let the theme handle background opacity')
            .setDesc('Uses --translucent-light-opacity / --translucent-dark-opacity from your theme. Disable to set opacity directly.')
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.themeHandlesOpacity)
                    .onChange(async (value) => {
                        this.plugin.settings.themeHandlesOpacity = value;
                        this.plugin.updateOverlayStyle();
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );

        if (!this.plugin.settings.themeHandlesOpacity) {
            new Setting(containerEl)
                .setName('Light mode background opacity')
                .setDesc('Opacity of the background in light mode (0 = fully transparent, 1 = fully opaque).')
                .addSlider((s) =>
                    s
                        .setLimits(0, 1, 0.01)
                        .setValue(this.plugin.settings.lightTintOpacity)
                        .setDynamicTooltip()
                        .onChange(async (value) => {
                            this.plugin.settings.lightTintOpacity = value;
                            this.plugin.updateOverlayStyle();
                            await this.plugin.saveSettings();
                        })
                );

            new Setting(containerEl)
                .setName('Dark mode background opacity')
                .setDesc('Opacity of the background in dark mode (0 = fully transparent, 1 = fully opaque).')
                .addSlider((s) =>
                    s
                        .setLimits(0, 1, 0.01)
                        .setValue(this.plugin.settings.darkTintOpacity)
                        .setDynamicTooltip()
                        .onChange(async (value) => {
                            this.plugin.settings.darkTintOpacity = value;
                            this.plugin.updateOverlayStyle();
                            await this.plugin.saveSettings();
                        })
                );
        }

        new Setting(containerEl)
            .setName('Let the theme handle background tint')
            .setDesc('Uses --background-secondary as the tint color. Disable to choose your own.')
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.themeHandlesTint)
                    .onChange(async (value) => {
                        this.plugin.settings.themeHandlesTint = value;
                        this.plugin.updateOverlayStyle();
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );

        if (!this.plugin.settings.themeHandlesTint) {
            new Setting(containerEl)
                .setName('Light mode tint color')
                .setDesc('Base color of the tint overlay in light mode.')
                .addColorPicker((cp) =>
                    cp
                        .setValue(this.plugin.settings.lightTintColor)
                        .onChange(async (value) => {
                            this.plugin.settings.lightTintColor = value;
                            this.plugin.updateOverlayStyle();
                            await this.plugin.saveSettings();
                        })
                );

            new Setting(containerEl)
                .setName('Dark mode tint color')
                .setDesc('Base color of the tint overlay in dark mode.')
                .addColorPicker((cp) =>
                    cp
                        .setValue(this.plugin.settings.darkTintColor)
                        .onChange(async (value) => {
                            this.plugin.settings.darkTintColor = value;
                            this.plugin.updateOverlayStyle();
                            await this.plugin.saveSettings();
                        })
                );
        }

        new Setting(containerEl)
            .setName('Reset to defaults')
            .setDesc('Restore all settings to their factory defaults.')
            .addButton((b) =>
                b
                    .setButtonText('Reset')
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
                        await this.plugin.saveSettings();
                        this.plugin.applyMaterial(this.plugin.settings.material);
                        this.plugin.updateOverlayStyle();
                        this.display();
                    })
            );
    }
}