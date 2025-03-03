export interface NotionProperty {
    id: string;
    type: string;
    // Add specific type properties based on the 'type' value
    // For example, for type 'title':
    title?: Array<{plain_text: string, annotations?: any, href?: string}>;
    // For type 'rich_text':
    rich_text?: Array<{plain_text: string, annotations?: any, href?: string}>;
    // For other types as needed
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

export interface NotionPageResponse {
    id: string;
    properties: NotionProperties;
    title?: Array<{plain_text: string}>;
    object: string;
    created_time?: string;
    last_edited_time?: string;
    url?: string;
    parent?: {
        type: string;
        database_id?: string;
    };
}
