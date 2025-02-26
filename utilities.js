const {requestUrl} = require("obsidian");

const fs = require("fs");
const moment = require("moment");
const axios = require("axios");
const path = require("path");

async function downloadImage(url, folderName, app) {
	const vaultPath = app.vault.adapter.basePath;

	const response = await axios.get(url, {
		responseType: "arraybuffer",
	});

	const filename = path.join(vaultPath, folderName, path.basename(url));
	fs.writeFileSync(filename, response.data);

	return filename;
}

const createFolder = async (app) => {
	const vaultPath = app.vault.adapter.basePath;

	const folderName = moment().format("YYYY-MM-DD-HH-mm-ss");
	return new Promise((resolve, reject) => {
		fs.mkdir(path.join(vaultPath, folderName), (err) => {
			if (err) {
				reject(err);
			}
			resolve(folderName);
		});
	});
};

async function downloadFile(url, outputPath, app) {
	const vaultPath = app.vault.adapter.basePath;
	const fullPath = path.join(vaultPath, outputPath);

	try {
		// Ensure the directory exists before trying to write the file
		const dir = path.dirname(fullPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, {recursive: true});
		}

		const response = await requestUrl({
			url: url,
			method: "GET",
			headers: {
				"Content-Type": "application/octet-stream",
			},
			mode: "no-cors",
			cache: "default",
		});

		if (!response) {
			throw new Error(`Failed to download file.`);
		}

		// Convert the response to an ArrayBuffer
		const arrayBuffer = await response.arrayBuffer;

		// Write the ArrayBuffer to the filesystem
		fs.writeFileSync(
			fullPath,
			new Uint8Array(arrayBuffer)
		);
	} catch (error) {
		console.error("Error in downloadFile:", error);
		throw error;
	}
}

const getImageExtension = (url) => {
	const extensionMatch = url.match(/\.(jpeg|jpg|gif|png)/);
	return extensionMatch ? extensionMatch[1] : "png";
};

const sanitizeTitle = (title) => {
	// Remove special characters and limit length
	return title
		.replace(/[^a-zA-Z0-9- ]/g, "") // Keep spaces and remove underscores from the regular expression
		.substring(0, 200);
};

const generateUniqueTitle = (title, folderPath) => {
	let uniqueTitle = title;
	let counter = 1;
	while (fs.existsSync(`${folderPath}/${uniqueTitle}.md`)) {
		uniqueTitle = `${title} (${counter})`;
		counter += 1;
	}
	return uniqueTitle;
};

const writeFilePromise = (fileName, content) => {
	return new Promise((resolve, reject) => {
		// Ensure directory exists
		const dir = path.dirname(fileName);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, {recursive: true});
		}

		// Generate unique filename
		const fileNameWithoutExt = path.join(dir, path.parse(fileName).name);
		const ext = path.extname(fileName);
		let uniqueFileName = fileName;
		let counter = 1;

		while (fs.existsSync(uniqueFileName)) {
			uniqueFileName = `${fileNameWithoutExt} (${counter})${ext}`;
			counter++;
		}

		fs.writeFile(uniqueFileName, content, function (err) {
			if (err) {
				console.error(`Error writing file ${uniqueFileName}: ${err}`);
				reject(err);
			} else {
				resolve(`${uniqueFileName} was saved!`);
			}
		});
	});
};

module.exports = {
	downloadImage,
	createFolder,
	downloadFile,
	getImageExtension,
	sanitizeTitle,
	writeFilePromise,
	generateUniqueTitle,
};
