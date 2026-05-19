const ts = require('typescript');

module.exports = {
  process(sourceText, sourcePath) {
    const output = ts.transpileModule(sourceText, {
      fileName: sourcePath,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        resolveJsonModule: true,
        sourceMap: true,
      },
    });

    return {
      code: output.outputText,
      map: output.sourceMapText ? JSON.parse(output.sourceMapText) : undefined,
    };
  },
};
