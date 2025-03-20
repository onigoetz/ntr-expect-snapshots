import {
  plugins as prettyFormatPlugins,
  format as prettyFormat,
} from "pretty-format";

const {
  DOMCollection,
  DOMElement,
  Immutable,
  ReactElement,
  ReactTestComponent,
  AsymmetricMatcher,
} = prettyFormatPlugins;

let PLUGINS = [
  ReactTestComponent,
  ReactElement,
  DOMElement,
  DOMCollection,
  Immutable,
  AsymmetricMatcher,
];

// Prepend to list so the last added is the first tested.
export function addSerializer(plugin) {
  PLUGINS = [plugin].concat(PLUGINS);
}

export function getSerializers() { return PLUGINS; }

export function serializeSnapshot(element) {
  return prettyFormat(element, {
    plugins: getSerializers(),
    indent: 2,
    escapeRegex: true,
    printFunctionName: false,
  });
}
