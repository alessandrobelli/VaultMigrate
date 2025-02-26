export interface NotionMigrationSettings {
    apiKey: string;
    databaseId: string;
    migrationPath: string;
    migrationLog: string;
    attachmentPath: string;
    attachPageId: boolean;
    importPageContent: boolean;
    isImporting: boolean;
    createRelationContentPage: boolean;
    createSemanticLinking: boolean;
    squashDateNamesForDataview: boolean;
    subpagesPath: string;
    importSubpages: boolean;
    enabledProperties: { [key: string]: boolean };
}

export const DEFAULT_SETTINGS: NotionMigrationSettings = {
    apiKey: "",
    databaseId: "",
    migrationPath: "",
    migrationLog: "",
    attachmentPath: "",
    attachPageId: false,
    importPageContent: true,
    isImporting: false,
    createRelationContentPage: true,
    enabledProperties: {},
    createSemanticLinking: true,
    squashDateNamesForDataview: true,
    importSubpages: true,
    subpagesPath: "subpages",
};
