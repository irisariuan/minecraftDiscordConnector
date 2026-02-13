import { joinPath } from "../utils";
import { buildInit } from "../utils/web";
import type {
	GetPaperProjectsReturn,
	PaperProject,
	GetPaperVersionsReturn,
	PaperVersion,
	BuildQuery,
	Build,
	ChannelBuildQuery,
	BuildNumberQuery,
} from "./jar/types";

const userAgent =
	"minecraftDiscordConnector/1.0 (https://github.com/irisariuan/minecraftDiscordConnector)";

const paperMcApiBaseUrl = "https://fill.papermc.io/v3";

function getFabricDownloadLink(
	minecraftVersion: string,
	fabricLoaderVersion: string,
	installerVersion: string,
) {
	return `https://meta.fabricmc.net/v2/versions/loader/${minecraftVersion}/${fabricLoaderVersion}/${installerVersion}/server/jar`;
}

export async function getAllPaperProjects() {
	const res = await fetch(
		joinPath(paperMcApiBaseUrl, "projects"),
		buildInit(userAgent),
	);
	if (!res.ok) return null;
	return res.json() as Promise<GetPaperProjectsReturn>;
}
export async function getPaperProject(search: string) {
	const res = await fetch(
		joinPath(paperMcApiBaseUrl, "projects", search),
		buildInit(userAgent),
	);
	if (!res.ok) return null;
	return res.json() as Promise<PaperProject>;
}
export function findHighestAvailableVersion(
	requireVersion: string,
	versions: Record<string, string[]>,
) {
	for (const [key, values] of Object.entries(versions)) {
		if (values.includes(requireVersion)) {
			return key;
		}
	}
	return null;
}
export async function getAllPaperVersions(project: string) {
	const res = await fetch(
		joinPath(paperMcApiBaseUrl, "projects", project, "versions"),
		buildInit(userAgent),
	);
	if (!res.ok) return null;
	return res.json() as Promise<GetPaperVersionsReturn>;
}
export async function getPaperVersion(project: string, version: string) {
	const res = await fetch(
		joinPath(paperMcApiBaseUrl, "projects", project, "versions", version),
		buildInit(userAgent),
	);
	if (!res.ok) return null;
	return res.json() as Promise<PaperVersion>;
}

export async function getPaperVersionBuild(
	project: string,
	version: string,
	query: ChannelBuildQuery,
): Promise<Build[] | null>;
export async function getPaperVersionBuild(
	project: string,
	version: string,
	query: BuildNumberQuery,
): Promise<Build | null>;
export async function getPaperVersionBuild(
	project: string,
	version: string,
	query: BuildQuery,
): Promise<Build | Build[] | null> {
	if ("channel" in query) {
		const url = new URL(
			joinPath(
				paperMcApiBaseUrl,
				"projects",
				project,
				"versions",
				version,
				"builds",
			),
		);
		for (const channel of query.channel) {
			url.searchParams.append("channel", channel);
		}
		console.log(url.toString());
		const res = await fetch(url, buildInit(userAgent));
		if (!res.ok) return null;
		return res.json();
	}
	if (query.latest) {
		const res = await fetch(
			joinPath(
				paperMcApiBaseUrl,
				"projects",
				project,
				"versions",
				version,
				"builds",
				"latest",
			),
			buildInit(userAgent),
		);
		if (!res.ok) return null;
		return res.json();
	}
	if (!query.build) return null;
	const res = await fetch(
		joinPath(
			paperMcApiBaseUrl,
			"projects",
			project,
			"versions",
			version,
			"builds",
			query.build,
		),
		buildInit(userAgent),
	);
	if (!res.ok) return null;
	return res.json();
}
