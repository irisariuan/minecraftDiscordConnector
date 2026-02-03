export interface GetPaperProjectsReturn {
	projects: PaperProject[];
}

export interface GetPaperVersionsReturn {
	versions: PaperVersion[];
}

export interface PaperProject {
	project: { id: string; name: string };
	versions: Record<string, string[]>;
}

export interface PaperVersion {
	builds: number[];
	version: {
		id: string;
		java: {
			flags: { recommended: string[] };
			version: { minimum: number };
		};
		support: {
			end: string;
			status: string;
		};
	};
}

export enum PaperBuildChannel {
	Alpha = "ALPHA",
	Beta = "BETA",
	Stable = "STABLE",
	Recommended = "RECOMMENDED",
}

export type BuildQuery = BuildNumberQuery | ChannelBuildQuery;

export type BuildNumberQuery =
	| { latest: true }
	| { latest: false; build: string };

export interface ChannelBuildQuery {
	channel: PaperBuildChannel[];
}

export interface Build {
	id: number;
	time: string;
	channel: string;
	commits: BuildCommit[];
	downloads: Record<string, BuildDownload[]>;
}

export interface BuildCommit {
	sha: string;
	/**
	 * ISO 8601 format
	 */
	time: string;
	message: string;
}

export interface BuildDownload {
	name: string;
	checksums: Record<string, string>;
	size: number;
	url: string;
}
