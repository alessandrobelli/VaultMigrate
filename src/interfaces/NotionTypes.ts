export interface NotionProperty {
    type: string;
    [key: string]: any;
}

export interface NotionProperties {
    [key: string]: NotionProperty;
}

export interface ImportControl {
    isImporting: boolean;
    forceStop: boolean;
}

export interface WriteFileOptions {
    content: string | null;
    fileName: string;
}
