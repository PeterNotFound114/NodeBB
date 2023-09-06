"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
const path = __importStar(require("path"));
const winston = __importStar(require("winston"));
const fs = __importStar(require("fs"));
const chalk = __importStar(require("chalk"));
const nconf = __importStar(require("nconf"));
const db = __importStar(require("../database"));
const events = __importStar(require("../events"));
const meta = __importStar(require("../meta"));
const plugins = __importStar(require("../plugins"));
const widgets = __importStar(require("../widgets"));
const privileges = __importStar(require("../privileges"));
const constants_1 = require("../constants");
function resetThemeTo(themeId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield meta.themes.set({
            type: 'local',
            id: themeId,
        });
        yield meta.configs.set('bootswatchSkin', '');
        winston.info(`[reset] Theme reset to ${themeId} and default skin`);
    });
}
function resetTheme(themeId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield fs.promises.access(path.join(constants_1.paths.nodeModules, themeId, 'package.json'));
        }
        catch (err) {
            winston.warn('[reset] Theme `%s` is not installed on this forum', themeId);
            throw new Error('theme-not-found');
        }
        yield resetThemeTo(themeId);
    });
}
function resetPlugins() {
    return __awaiter(this, void 0, void 0, function* () {
        if (nconf.get('plugins:active')) {
            winston.error('Cannot reset plugins while plugin state is set in the configuration (config.json, environmental variables or terminal arguments), please modify the configuration instead');
            process.exit(1);
        }
        yield db.delete('plugins:active');
        winston.info('[reset] All Plugins De-activated');
    });
}
function resetWidgets() {
    return __awaiter(this, void 0, void 0, function* () {
        yield plugins.reload();
        yield widgets.reset();
        winston.info('[reset] All Widgets moved to Draft Zone');
    });
}
function resetSettings() {
    return __awaiter(this, void 0, void 0, function* () {
        yield privileges.global.give(['groups:local:login'], 'registered-users');
        winston.info('[reset] registered-users given login privilege');
        winston.info('[reset] Settings reset to default');
    });
}
function resetThemes() {
    return __awaiter(this, void 0, void 0, function* () {
        yield resetThemeTo('nodebb-theme-persona');
    });
}
function resetPlugin(pluginId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (nconf.get('plugins:active')) {
                winston.error('Cannot reset plugins while the plugin state is set in the configuration (config.json, environmental variables, or terminal arguments), please modify the configuration instead');
                process.exit(1);
            }
            const isActive = yield db.isSortedSetMember('plugins:active', pluginId);
            if (isActive) {
                yield db.sortedSetRemove('plugins:active', pluginId);
                yield events.log({
                    type: 'plugin-deactivate',
                    text: pluginId,
                });
                winston.info('[reset] Plugin `%s` disabled', pluginId);
            }
            else {
                winston.warn('[reset] Plugin `%s` was not active on this forum', pluginId);
                winston.info('[reset] No action taken.');
            }
        }
        catch (err) {
            const stack = err.stack;
            winston.error(`[reset] Could not disable plugin: ${pluginId} encountered error %s\n${stack}`);
            throw err;
        }
    });
}
function reset(options) {
    return __awaiter(this, void 0, void 0, function* () {
        const map = {
            theme: () => __awaiter(this, void 0, void 0, function* () {
                let themeId = options.theme;
                if (themeId) {
                    yield resetThemes();
                }
                else {
                    if (!constants_1.themeNamePattern.test(themeId)) {
                        // Allow omission of `nodebb-theme-`
                        themeId = `nodebb-theme-${themeId}`;
                    }
                    themeId = (yield plugins.autocomplete(themeId));
                    yield resetTheme(themeId);
                }
            }),
            plugin: () => __awaiter(this, void 0, void 0, function* () {
                let pluginId = options.plugin;
                if (pluginId) {
                    yield resetPlugins();
                }
                else {
                    if (!constants_1.pluginNamePattern.test(pluginId)) {
                        // Allow omission of `nodebb-plugin-`
                        pluginId = `nodebb-plugin-${pluginId}`;
                    }
                    pluginId = (yield plugins.autocomplete(pluginId));
                    yield resetPlugin(pluginId);
                }
            }),
            widgets: resetWidgets,
            settings: resetSettings,
            all: () => __awaiter(this, void 0, void 0, function* () {
                yield resetWidgets();
                yield resetThemes();
                yield resetPlugin();
                yield resetSettings();
            }),
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
            yield db.init();
            for (const task of tasks) {
                /* eslint-disable no-await-in-loop */
                yield task();
            }
            winston.info('[reset] Reset complete. Please run `./nodebb build` to rebuild assets.');
            process.exit(0);
        }
        catch (err) {
            const msg = err.message;
            winston.error(`[reset] Errors were encountered during reset -- ${msg}`);
            process.exit(1);
        }
    });
}
exports.default = reset;
