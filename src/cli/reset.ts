/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import * as path from 'path';
import * as winston from 'winston';
import * as fs from 'fs';
import * as chalk from 'chalk';
import * as nconf from 'nconf';

import * as db from '../database';
import * as events from '../events';
import * as meta from '../meta';
import * as plugins from '../plugins';
import * as widgets from '../widgets';
import * as privileges from '../privileges';
import { paths, pluginNamePattern, themeNamePattern } from '../constants';

async function resetThemeTo(themeId: string) {
    await meta.themes.set({
        type: 'local',
        id: themeId,
    });
    await meta.configs.set('bootswatchSkin', '');
    winston.info(`[reset] Theme reset to ${themeId} and default skin`);
}

async function resetTheme(themeId: string) {
    try {
        await fs.promises.access(path.join(paths.nodeModules, themeId, 'package.json'));
    } catch (err) {
        winston.warn('[reset] Theme `%s` is not installed on this forum', themeId);
        throw new Error('theme-not-found');
    }
    await resetThemeTo(themeId);
}

async function resetPlugins() {
    if (nconf.get('plugins:active')) {
        winston.error('Cannot reset plugins while plugin state is set in the configuration (config.json, environmental variables or terminal arguments), please modify the configuration instead');
        process.exit(1);
    }
    await db.delete('plugins:active');
    winston.info('[reset] All Plugins De-activated');
}

async function resetWidgets() {
    await plugins.reload();
    await widgets.reset();
    winston.info('[reset] All Widgets moved to Draft Zone');
}


async function resetSettings() {
    await privileges.global.give(['groups:local:login'], 'registered-users');
    winston.info('[reset] registered-users given login privilege');
    winston.info('[reset] Settings reset to default');
}

async function resetThemes() {
    await resetThemeTo('nodebb-theme-persona');
}

async function resetPlugin(pluginId?: string) {
    try {
        if (nconf.get('plugins:active')) {
            winston.error(
                'Cannot reset plugins while the plugin state is set in the configuration (config.json, environmental variables, or terminal arguments), please modify the configuration instead'
            );
            process.exit(1);
        }
        const isActive: boolean = await db.isSortedSetMember('plugins:active', pluginId) as boolean;
        if (isActive) {
            await db.sortedSetRemove('plugins:active', pluginId);
            await events.log({
                type: 'plugin-deactivate',
                text: pluginId,
            });
            winston.info('[reset] Plugin `%s` disabled', pluginId);
        } else {
            winston.warn('[reset] Plugin `%s` was not active on this forum', pluginId);
            winston.info('[reset] No action taken.');
        }
    } catch (err) {
        const stack: string = err.stack as string;
        winston.error(`[reset] Could not disable plugin: ${pluginId} encountered error %s\n${stack}`);
        throw err;
    }
}

export default async function reset(options: { [key: string]: unknown }) {
    const map: { [key: string]: () => Promise<void> } = {
        theme: async () => {
            let themeId: string = options.theme as string;
            if (themeId) {
                await resetThemes();
            } else {
                if (!themeNamePattern.test(themeId)) {
                    // Allow omission of `nodebb-theme-`
                    themeId = `nodebb-theme-${themeId}`;
                }
                themeId = await plugins.autocomplete(themeId) as string;
                await resetTheme(themeId);
            }
        },
        plugin: async () => {
            let pluginId: string = options.plugin as string;
            if (pluginId) {
                await resetPlugins();
            } else {
                if (!pluginNamePattern.test(pluginId)) {
                    // Allow omission of `nodebb-plugin-`
                    pluginId = `nodebb-plugin-${pluginId}`;
                }
                pluginId = await plugins.autocomplete(pluginId) as string;
                await resetPlugin(pluginId);
            }
        },
        widgets: resetWidgets,
        settings: resetSettings,
        all: async () => {
            await resetWidgets();
            await resetThemes();
            await resetPlugin();
            await resetSettings();
        },
    };

    const tasks = Object.keys(map).filter(x => options[x]).map(x => map[x]);

    if (tasks.length === 0) {
        console.log([
            chalk.yellow('No arguments passed in, so nothing was reset.\n'),
            `Use ./nodebb reset ${chalk.red('{-t|-p|-w|-s|-a}')}`,
            '    -t\tthemes',
            '    -p\tplugins',
            '    -w\twidgets',
            '    -s\tsettings',
            '    -a\tall of the above',
            '',
            'Plugin and theme reset flags (-p & -t) can take a single argument',
            '    e.g. ./nodebb reset -p nodebb-plugin-mentions, ./nodebb reset -t nodebb-theme-persona',
            '         Prefix is optional, e.g. ./nodebb reset -p markdown, ./nodebb reset -t persona',
        ].join('\n'));

        process.exit(0);
    }

    try {
        await db.init();
        for (const task of tasks) {
        /* eslint-disable no-await-in-loop */
            await task();
        }
        winston.info('[reset] Reset complete. Please run `./nodebb build` to rebuild assets.');
        process.exit(0);
    } catch (err) {
        const msg: string = err.message as string;
        winston.error(`[reset] Errors were encountered during reset -- ${msg}`);
        process.exit(1);
    }
}
