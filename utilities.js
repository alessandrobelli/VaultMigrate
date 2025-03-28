import { requestUrl, moment, normalizePath, TFolder } from "obsidian";
import axios from "axios";
async function downloadImage(url, folderName, app) {
	const response = await axios.get(url, {
		responseType: "arraybuffer",
	});

	const filename = `${folderName}/${getFilenameFromUrl(url)}`;
	await app.vault.createBinary(normalizePath(filename), response.data);

	return filename;
}

// Helper function to extract filename from URL
function getFilenameFromUrl(url) {
	const urlObj = new URL(url);
	const pathname = urlObj.pathname;
	const filename = pathname.split('/').pop();
	return filename || `file_${Date.now()}`;
}

// Create a folder in the vault
async function createFolder(app) {
	const folderName = moment().format("YYYY-MM-DD-HH-mm-ss");
	try {
		await app.vault.createFolder(folderName);
		return folderName;
	} catch (error) {
		console.error(`Error creating folder: ${error}`);
		throw error;
	}
}

// Download a file and save it to the vault
async function downloadFile(url, outputPath, app, apiKey) {
	try {
		// Ensure parent folders exist
		const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
		if (dir) {
			const folderExists = app.vault.getAbstractFileByPath(normalizePath(dir)) instanceof TFolder;
			if (!folderExists) {
				await app.vault.createFolder(normalizePath(dir));
			}
		}

		const response = await requestUrl({
			url: url,
			method: "GET",
			headers: {
				"Content-Type": "application/octet-stream",
				...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
			},
			mode: "no-cors",
			cache: "default",
		});

		if (!response) {
			throw new Error(`Failed to download file.`);
		}

		// Convert the response to an ArrayBuffer
		const arrayBuffer = await response.arrayBuffer;

		// Create the file in Obsidian
		await app.vault.createBinary(
			normalizePath(outputPath),
			new Uint8Array(arrayBuffer)
		);

		return outputPath;
	} catch (error) {
		console.error("Error in downloadFile:", error);
		throw error;
	}
}

// Get the extension of an image from a URL
const getImageExtension = (url) => {
	const extensionMatch = url.match(/\.(jpeg|jpg|gif|png)/);
	return extensionMatch ? extensionMatch[1] : "png";
};

// Remove special characters from a title
const sanitizeTitle = (title) => {
	// Remove special characters and limit length
	return title
		.replace(/[^a-zA-Z0-9- ]/g, "") // Keep spaces and remove underscores from the regular expression
		.substring(0, 200);
};

// Generate a unique title for a file
async function generateUniqueTitle(title, folderPath, app) {
	let uniqueTitle = title;
	let counter = 1;
	const mdPath = `${folderPath}/${uniqueTitle}.md`;

	// Check if file exists in the vault
	while (app.vault.getAbstractFileByPath(normalizePath(mdPath))) {
		uniqueTitle = `${title} (${counter})`;
		counter += 1;
	}

	return uniqueTitle;
}

// Write content to a file in the vault
async function writeFilePromise(filePath, content, app) {
	try {
		// Ensure parent folder exists
		const dir = filePath.substring(0, filePath.lastIndexOf('/'));
		if (dir) {
			const folder = app.vault.getAbstractFileByPath(normalizePath(dir));
			if (!folder || !(folder instanceof TFolder)) {
				await app.vault.createFolder(normalizePath(dir));
			}
		}

		// Create file
		await app.vault.create(normalizePath(filePath), content);
		return `${filePath} was saved!`;
	} catch (error) {
		console.error(`Error writing file ${filePath}: ${error}`);
		throw error;
	}
}

export {
	downloadImage,
	createFolder,
	downloadFile,
	getImageExtension,
	sanitizeTitle,
	writeFilePromise,
	generateUniqueTitle,
	getFilenameFromUrl
};
