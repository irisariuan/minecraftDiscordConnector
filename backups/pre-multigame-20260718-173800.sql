--
-- PostgreSQL database dump
--

\restrict Mh5yaoZ4puMegPB4BasaMGSAoTa8YU75jgglOWG0KOCcn32JXQprxQMsDB8nUdf

-- Dumped from database version 14.23 (Homebrew)
-- Dumped by pg_dump version 14.23 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Permission; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."Permission" (
    "userId" text NOT NULL,
    "serverId" integer NOT NULL,
    permission integer NOT NULL,
    force boolean DEFAULT false NOT NULL
);


ALTER TABLE public."Permission" OWNER TO alvinho;

--
-- Name: Player; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."Player" (
    playername text NOT NULL,
    uuid text NOT NULL,
    "discordId" text NOT NULL
);


ALTER TABLE public."Player" OWNER TO alvinho;

--
-- Name: Plugin; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."Plugin" (
    id integer NOT NULL,
    "projectId" text NOT NULL,
    "versionId" text NOT NULL,
    "filePath" text NOT NULL,
    "serverId" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Plugin" OWNER TO alvinho;

--
-- Name: Plugin_id_seq; Type: SEQUENCE; Schema: public; Owner: alvinho
--

CREATE SEQUENCE public."Plugin_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public."Plugin_id_seq" OWNER TO alvinho;

--
-- Name: Plugin_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: alvinho
--

ALTER SEQUENCE public."Plugin_id_seq" OWNED BY public."Plugin".id;


--
-- Name: Server; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."Server" (
    id integer NOT NULL,
    path text NOT NULL,
    "loaderType" text NOT NULL,
    "modType" text NOT NULL,
    version text NOT NULL,
    "pluginPath" text NOT NULL,
    tag text,
    port integer[] DEFAULT ARRAY[25565],
    "apiPort" integer,
    "gameType" text DEFAULT 'minecraft'::text NOT NULL,
    "startupScript" text
);


ALTER TABLE public."Server" OWNER TO alvinho;

--
-- Name: ServerAccess; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."ServerAccess" (
    "userId" text NOT NULL,
    "serverId" integer NOT NULL
);


ALTER TABLE public."ServerAccess" OWNER TO alvinho;

--
-- Name: Server_id_seq; Type: SEQUENCE; Schema: public; Owner: alvinho
--

CREATE SEQUENCE public."Server_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public."Server_id_seq" OWNER TO alvinho;

--
-- Name: Server_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: alvinho
--

ALTER SEQUENCE public."Server_id_seq" OWNED BY public."Server".id;


--
-- Name: Setting; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."Setting" (
    "serverId" integer NOT NULL,
    type text NOT NULL,
    name text NOT NULL,
    value integer NOT NULL
);


ALTER TABLE public."Setting" OWNER TO alvinho;

--
-- Name: Ticket; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."Ticket" (
    description text,
    name text NOT NULL,
    effect text NOT NULL,
    id text NOT NULL,
    "effectData" jsonb NOT NULL
);


ALTER TABLE public."Ticket" OWNER TO alvinho;

--
-- Name: TicketHistory; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."TicketHistory" (
    id text NOT NULL,
    "ticketId" text NOT NULL,
    action text NOT NULL,
    reason text,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."TicketHistory" OWNER TO alvinho;

--
-- Name: Transaction; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."Transaction" (
    id text NOT NULL,
    amount integer NOT NULL,
    "beforeAmount" integer NOT NULL,
    "afterAmount" integer NOT NULL,
    reason text,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userId" text NOT NULL,
    "serverId" integer,
    "finalAmount" integer,
    "relatedTicketHistoryId" text[],
    "ticketId" text[]
);


ALTER TABLE public."Transaction" OWNER TO alvinho;

--
-- Name: User; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."User" (
    id text NOT NULL,
    credits integer DEFAULT 0 NOT NULL,
    permission integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."User" OWNER TO alvinho;

--
-- Name: UserTicket; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."UserTicket" (
    id text NOT NULL,
    "ticketId" text NOT NULL,
    "userId" text NOT NULL,
    reason text,
    "maxUse" integer DEFAULT 1,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "expiresAt" timestamp(3) without time zone
);


ALTER TABLE public."UserTicket" OWNER TO alvinho;

--
-- Name: _TicketHistoryToTransaction; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."_TicketHistoryToTransaction" (
    "A" text NOT NULL,
    "B" text NOT NULL
);


ALTER TABLE public."_TicketHistoryToTransaction" OWNER TO alvinho;

--
-- Name: _TransactionToUserTicket; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public."_TransactionToUserTicket" (
    "A" text NOT NULL,
    "B" text NOT NULL
);


ALTER TABLE public."_TransactionToUserTicket" OWNER TO alvinho;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: alvinho
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO alvinho;

--
-- Name: Plugin id; Type: DEFAULT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Plugin" ALTER COLUMN id SET DEFAULT nextval('public."Plugin_id_seq"'::regclass);


--
-- Name: Server id; Type: DEFAULT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Server" ALTER COLUMN id SET DEFAULT nextval('public."Server_id_seq"'::regclass);


--
-- Data for Name: Permission; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."Permission" ("userId", "serverId", permission, force) FROM stdin;
678185861275189258	2	256	f
844193954756689921	2	768	f
709605543358234674	1	1048576	f
1372227913923039312	1	1048576	f
950063797358428260	1	1048576	f
804333943775559680	1	1048576	f
841246467536584704	1	1048576	f
825752488388329514	1	1048576	f
645919565758464010	1	1048576	f
780972375394091009	1	1048576	f
634021280529645569	1	1048576	f
713930443027644477	1	1048576	f
658305794038825030	1	0	f
\.


--
-- Data for Name: Player; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."Player" (playername, uuid, "discordId") FROM stdin;
Snow_Flakes0724	a1766ffc-eea1-4de6-bd26-f8836987a7c7	780972375394091009
Ariuan	d790ff65-3df8-4f50-aaad-be5e7c657a79	658305794038825030
generral	fb15c700-c9ff-4a02-9d51-264de6ad99e3	844193954756689921
on99starlight	11fa2819-905a-4a9a-840f-5344ccf23348	709605543358234674
NSStardust	0d818dbd-9d0c-4b0e-89f2-eebcd5dfb462	645919565758464010
.ReadingMarrow14	00000000-0000-0000-0009-01fb9606eb08	634021280529645569
\.


--
-- Data for Name: Plugin; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."Plugin" (id, "projectId", "versionId", "filePath", "serverId", "createdAt", "updatedAt") FROM stdin;
1248	1VSGxqkt	MxlSUiGV	/Users/alvinho/Server/techplus/mods/BlockRunner-v4.2.2-1.19.2-Forge.jar	9	2026-04-27 18:44:46.873	2026-04-27 18:44:46.873
1249	uxLAKWU8	yOYdkPX6	/Users/alvinho/Server/techplus/mods/corn_delight-1.0.3-1.19.2.jar	9	2026-04-27 18:44:46.91	2026-04-27 18:44:46.91
3	nmDcB62a	NnNX8LBn	/Users/alvinho/Server/cobblemon-1.21.1/mods/modernfix-fabric-5.25.1+mc1.21.1.jar	2	2025-11-26 00:05:57.133	2025-11-26 00:05:57.133
4	qQyHxfxd	D8K0KJXM	/Users/alvinho/Server/cobblemon-1.21.1/mods/NoChatReports-FABRIC-1.21.1-v2.9.1.jar	2	2025-11-26 00:06:31.641	2025-11-26 00:06:31.641
5	fQEb0iXm	Acz3ttTp	/Users/alvinho/Server/cobblemon-1.21.1/mods/krypton-0.2.8.jar	2	2025-11-26 00:24:59.18	2025-11-26 00:24:59.18
1250	rH2QzhPh	pPKj4Q5L	/Users/alvinho/Server/techplus/mods/farmers-cutting-quark-1.0.0-1.19.jar	9	2026-04-27 18:44:46.938	2026-04-27 18:44:46.938
1251	bbGCtEvb	ASuYpCVK	/Users/alvinho/Server/techplus/mods/ArmorStatues-v4.0.8-1.19.2-Forge.jar	9	2026-04-27 18:44:46.973	2026-04-27 18:44:46.973
1252	OZBR5JT5	iYAQ1oaP	/Users/alvinho/Server/techplus/mods/EasyAnvils-v4.0.11-1.19.2-Forge.jar	9	2026-04-27 18:44:46.998	2026-04-27 18:44:46.998
1253	kkmrDlKT	qpCqqA93	/Users/alvinho/Server/techplus/mods/TerraBlender-forge-1.19.2-2.0.1.166.jar	9	2026-04-27 18:44:47.03	2026-04-27 18:44:47.03
1254	B0g2vT6l	MqJJHr9Y	/Users/alvinho/Server/techplus/mods/rechiseled-1.1.6-forge-mc1.19.2.jar	9	2026-04-27 18:44:47.093	2026-04-27 18:44:47.093
1255	r4Knci2k	BRGHEQfA	/Users/alvinho/Server/techplus/mods/interiors-0.5.6+forge-mc1.19.2-build.105.jar	9	2026-04-27 18:44:47.124	2026-04-27 18:44:47.124
1256	AVPTFuxC	UH1I51wt	/Users/alvinho/Server/techplus/mods/AdditionalBanners-Forge-1.19.2-10.1.7.jar	9	2026-04-27 18:44:47.151	2026-04-27 18:44:47.151
1257	L25fOeGq	gsnrKi46	/Users/alvinho/Server/techplus/mods/customizableelytra-1.19.0-1.7.4.jar	9	2026-04-27 18:44:47.193	2026-04-27 18:44:47.193
1258	W9CiRGYK	T9vNtB4D	/Users/alvinho/Server/techplus/mods/infusion_table-1.2.0.jar	9	2026-04-27 18:44:47.219	2026-04-27 18:44:47.219
1259	zUBn5hHr	OmkOgujn	/Users/alvinho/Server/techplus/mods/advancementframes-1.19.2-2.0.0.jar	9	2026-04-27 18:44:47.25	2026-04-27 18:44:47.25
1260	ayPU0OHc	wpAWKJ20	/Users/alvinho/Server/techplus/mods/structure_layout_optimizer-forge-1.0.10.jar	9	2026-04-27 18:44:47.282	2026-04-27 18:44:47.282
1261	VsM5EDoI	SnLXbWe9	/Users/alvinho/Server/techplus/mods/blueprint-1.19.2-6.2.0.jar	9	2026-04-27 18:44:47.321	2026-04-27 18:44:47.321
1262	rfj2v0X6	JSvYKZCe	/Users/alvinho/Server/techplus/mods/SizeShiftingPotions-forge-1.19.2-1.5.1.jar	9	2026-04-27 18:44:47.351	2026-04-27 18:44:47.351
1263	9eGKb6K1	c2pRRWUm	/Users/alvinho/Server/techplus/mods/voicechat-forge-1.19.2-2.5.36.jar	9	2026-04-27 18:44:47.459	2026-04-27 18:44:47.459
1264	Ht4BfYp6	rgVgefNE	/Users/alvinho/Server/techplus/mods/YungsBridges-1.19.2-Forge-3.1.0.jar	9	2026-04-27 18:44:47.492	2026-04-27 18:44:47.492
24	q9Lcd0FU	2BMx3SKk	/Users/alvinho/Server/paper-1.21.8/plugins/FoxAddition.jar	1	2026-02-15 15:22:38.453	2026-02-15 15:22:38.453
1265	7RvRWn6p	tMsh5MyG	/Users/alvinho/Server/techplus/mods/Icterine-forge-1.2.0.jar	9	2026-04-27 18:44:47.523	2026-04-27 18:44:47.523
1266	1bokaNcj	rCBwdCZO	/Users/alvinho/Server/techplus/mods/Xaeros_Minimap_25.2.6_Forge_1.19.1.jar	9	2026-04-27 18:44:47.568	2026-04-27 18:44:47.568
1267	yJR377od	HZ6zHTth	/Users/alvinho/Server/techplus/mods/aquatictorches-1.19-1.1.0.jar	9	2026-04-27 18:44:47.596	2026-04-27 18:44:47.596
1268	nPZr02ET	WJBCsJlq	/Users/alvinho/Server/techplus/mods/netherportalfix-forge-1.19-10.0.2.jar	9	2026-04-27 18:44:47.624	2026-04-27 18:44:47.624
29	evkiwA7V	mSS9faHn	/Users/alvinho/Server/paper-1.21.8/plugins/AxiomPaperPlugin-5.0.4-for-MC1.21.11.jar	1	2026-04-16 12:31:02.573	2026-04-16 12:31:02.573
1269	uXXizFIs	CtXsUUz6	/Users/alvinho/Server/techplus/mods/ferritecore-5.0.3-forge.jar	9	2026-04-27 18:44:47.651	2026-04-27 18:44:47.651
31	swbUV1cr	Vb2ZE8bR	/Users/alvinho/Server/paper-1.21.8/plugins/bluemap-5.16-paper.jar	1	2026-04-24 11:49:17.394	2026-04-24 11:49:17.394
1270	kCpssoSb	nHeyxX0A	/Users/alvinho/Server/techplus/mods/Fastload-Reforged-mc1.19.2-3.4.0.jar	9	2026-04-27 18:44:47.68	2026-04-27 18:44:47.68
1271	WNdd2blX	KCMrvAXI	/Users/alvinho/Server/techplus/mods/DeathKnell-Forge-1.19.2-6.0.3.jar	9	2026-04-27 18:44:47.709	2026-04-27 18:44:47.709
1272	cPle5Z8G	VDTdGjUK	/Users/alvinho/Server/techplus/mods/endergetic-1.19.2-4.0.0.jar	9	2026-04-27 18:44:47.886	2026-04-27 18:44:47.886
40	gvQqBUqZ	XQJtuOTA	/Users/alvinho/Server/cobblemon-1.21.1/mods/lithium-fabric-0.15.3+mc1.21.1.jar	2	2026-04-24 12:21:13.67	2026-04-24 12:21:13.67
1273	BnXpPaut	yrd5wZhl	/Users/alvinho/Server/techplus/mods/fluidlogged-1.2.0-forge-mc1.19.jar	9	2026-04-27 18:44:47.915	2026-04-27 18:44:47.915
1274	pNalfbjI	8WvRrClF	/Users/alvinho/Server/techplus/mods/paintable-1.0d-1.19.2.jar	9	2026-04-27 18:44:47.961	2026-04-27 18:44:47.961
43	uXXizFIs	sOzRw3CG	/Users/alvinho/Server/cobblemon-1.21.1/mods/ferritecore-7.0.3-fabric.jar	2	2026-04-24 12:39:02.391	2026-04-24 12:39:02.391
1275	VKXzIykF	T1eFly6W	/Users/alvinho/Server/techplus/mods/sit-1.19-1.3.3.jar	9	2026-04-27 18:44:47.988	2026-04-27 18:44:47.988
1276	Vj70oKlA	1.0.1-Forge1.17%2B	/Users/alvinho/Server/techplus/mods/horsestonks-forge-1.17+-1.0.1.jar	9	2026-04-27 18:44:48.022	2026-04-27 18:44:48.022
1277	JRYQR8rr	f16ggOyj	/Users/alvinho/Server/techplus/mods/noisium-1.0.2.jar	9	2026-04-27 18:44:48.054	2026-04-27 18:44:48.054
1278	JtSnhtNJ	3kuWUhts	/Users/alvinho/Server/techplus/mods/Delightful-1.19.2-3.4.1.jar	9	2026-04-27 18:44:48.092	2026-04-27 18:44:48.092
1279	qQyHxfxd	RNAG69Zu	/Users/alvinho/Server/techplus/mods/NoChatReports-FORGE-1.19.2-v1.5.1.jar	9	2026-04-27 18:44:48.119	2026-04-27 18:44:48.119
1280	HWHl8Evb	1cVegazl	/Users/alvinho/Server/techplus/mods/mutil-1.19.2-5.2.0.jar	9	2026-04-27 18:44:48.148	2026-04-27 18:44:48.148
1281	WPE5gRs9	rLTtWIfx	/Users/alvinho/Server/techplus/mods/create-confectionery1.19.2_v1.0.9.jar	9	2026-04-27 18:44:48.2	2026-04-27 18:44:48.2
1282	xuDOzCLy	rPlsZgp0	/Users/alvinho/Server/techplus/mods/JadeAddons-1.19.2-forge-3.6.0.jar	9	2026-04-27 18:44:48.228	2026-04-27 18:44:48.228
1283	AtB5mHky	L63H84ys	/Users/alvinho/Server/techplus/mods/watut-forge-1.19.2-1.0.14.jar	9	2026-04-27 18:44:48.257	2026-04-27 18:44:48.257
1284	nvQzSEkH	kp0HjPre	/Users/alvinho/Server/techplus/mods/Jade-1.19.1-forge-8.9.2.jar	9	2026-04-27 18:44:48.292	2026-04-27 18:44:48.292
1285	2eT495vq	np1EcSVx	/Users/alvinho/Server/techplus/mods/saturn-mc1.19.2-0.1.4.jar	9	2026-04-27 18:44:48.32	2026-04-27 18:44:48.32
1286	EsAfCjCV	forge-mc1.19-2.4.2	/Users/alvinho/Server/techplus/mods/appleskin-forge-mc1.19-2.4.2.jar	9	2026-04-27 18:44:48.346	2026-04-27 18:44:48.346
1287	GmjmRQ0A	2YFOoeUh	/Users/alvinho/Server/techplus/mods/sliceanddice-forge-2.4.0.jar	9	2026-04-27 18:44:48.38	2026-04-27 18:44:48.38
1288	h5JyLdjM	FQhDA1rS	/Users/alvinho/Server/techplus/mods/domesticationinnovation-1.6.1-1.19.2.jar	9	2026-04-27 18:44:48.414	2026-04-27 18:44:48.414
1289	kU1G12Nn	AjwN7Aq8	/Users/alvinho/Server/techplus/mods/createaddition-1.19.2-1.2.2.jar	9	2026-04-27 18:44:48.457	2026-04-27 18:44:48.457
1290	a9AsUNGn	fim7a2ol	/Users/alvinho/Server/techplus/mods/Statement-4.2.7+1.19.2-forge.jar	9	2026-04-27 18:44:48.483	2026-04-27 18:44:48.483
1291	fFEIiSDQ	UQu29fD5	/Users/alvinho/Server/techplus/mods/supplementaries-1.19.2-2.4.20.jar	9	2026-04-27 18:44:48.701	2026-04-27 18:44:48.701
1292	MBAkmtvl	d7a0S3hj	/Users/alvinho/Server/techplus/mods/balm-forge-1.19.2-4.6.0.jar	9	2026-04-27 18:44:48.733	2026-04-27 18:44:48.733
1293	X0uEaA4Z	2OgHaTNI	/Users/alvinho/Server/techplus/mods/Ender-Relay-1.19.2-Forge-1.1.0.jar	9	2026-04-27 18:44:48.758	2026-04-27 18:44:48.758
1294	KUInlTFo	SFWaKYwq	/Users/alvinho/Server/techplus/mods/alloyed-1.19.2-v1.5a.jar	9	2026-04-27 18:44:48.786	2026-04-27 18:44:48.786
1295	VZptDEBF	1.19.1-1.3.7	/Users/alvinho/Server/techplus/mods/ServerTabInfo-1.19.1-1.3.7.jar	9	2026-04-27 18:44:48.816	2026-04-27 18:44:48.816
1296	nmoqTijg	LRDUyYPU	/Users/alvinho/Server/techplus/mods/sophisticatedcore-1.19.2-0.6.4.730.jar	9	2026-04-27 18:44:48.855	2026-04-27 18:44:48.855
1297	1jvt7RTc	g6YtnyPC	/Users/alvinho/Server/techplus/mods/AxesAreWeapons-1.7.3-forge-1.19.2.jar	9	2026-04-27 18:44:48.883	2026-04-27 18:44:48.883
1298	ZzjhlDgM	AYmDx1OW	/Users/alvinho/Server/techplus/mods/Steam_Rails-1.6.6+forge-mc1.19.2.jar	9	2026-04-27 18:44:48.996	2026-04-27 18:44:48.996
1299	wPQ6GgFE	GuYzoHQC	/Users/alvinho/Server/techplus/mods/create_power_loader-1.5.0-mc1.19.2.jar	9	2026-04-27 18:44:49.03	2026-04-27 18:44:49.03
1300	gJ5afkVv	zgdMDJ9K	/Users/alvinho/Server/techplus/mods/bellsandwhistles-v0.4.4-1.19.2.jar	9	2026-04-27 18:44:49.058	2026-04-27 18:44:49.058
1301	ojFjz7JF	4C9cxXuI	/Users/alvinho/Server/techplus/mods/untitledduckmod-0.6.1-1.19.2-forge.jar	9	2026-04-27 18:44:49.091	2026-04-27 18:44:49.091
1302	tagwiZkJ	6tFcWl5d	/Users/alvinho/Server/techplus/mods/polymorph-forge-0.46.6+1.19.2.jar	9	2026-04-27 18:44:49.12	2026-04-27 18:44:49.12
1303	KM7gMSY1	uXDwLG3V	/Users/alvinho/Server/techplus/mods/skippy-pearls-1.4.jar	9	2026-04-27 18:44:49.155	2026-04-27 18:44:49.155
1304	OVb8ZE5p	Uf9jCC3m	/Users/alvinho/Server/techplus/mods/BoatBreakFix-Universal-1.0.2.jar	9	2026-04-27 18:44:49.185	2026-04-27 18:44:49.185
1305	LN9BxssP	HHm0Di8Y	/Users/alvinho/Server/techplus/mods/supermartijn642configlib-1.1.8-forge-mc1.19.jar	9	2026-04-27 18:44:49.214	2026-04-27 18:44:49.214
1306	XNlO7sBv	4szLNMTj	/Users/alvinho/Server/techplus/mods/YungsBetterDesertTemples-1.19.2-Forge-2.2.2.jar	9	2026-04-27 18:44:49.316	2026-04-27 18:44:49.316
1307	PYQD8noM	qnTJx9bI	/Users/alvinho/Server/techplus/mods/majrusz-library-forge-1.19.2-7.0.5-backport.1.jar	9	2026-04-27 18:44:49.35	2026-04-27 18:44:49.35
1308	rEuzehyH	EUIz7jbt	/Users/alvinho/Server/techplus/mods/findme-3.1.0-forge.jar	9	2026-04-27 18:44:49.38	2026-04-27 18:44:49.38
1309	ZZLWU8jS	CJ0dObLc	/Users/alvinho/Server/techplus/mods/potionbundles-1.19.1-1.6.jar	9	2026-04-27 18:44:49.408	2026-04-27 18:44:49.408
1310	h7QgiH72	YEuo20pc	/Users/alvinho/Server/techplus/mods/create_crystal_clear-0.2.1-1.19.2.jar	9	2026-04-27 18:44:49.445	2026-04-27 18:44:49.445
1311	q6eiiQ07	2r4TLyh6	/Users/alvinho/Server/techplus/mods/voidtotem-forge-1.19.2-2.1.0.jar	9	2026-04-27 18:44:49.473	2026-04-27 18:44:49.473
1312	1ZqmoFFP	ZMHn5FFd	/Users/alvinho/Server/techplus/mods/hourglass-1.19.1-1.2.1.1.jar	9	2026-04-27 18:44:49.5	2026-04-27 18:44:49.5
1313	lhGA9TYQ	96L7fC9l	/Users/alvinho/Server/techplus/mods/architectury-6.6.92-forge.jar	9	2026-04-27 18:44:49.533	2026-04-27 18:44:49.533
1314	6FtRfnLg	nybnGUJv	/Users/alvinho/Server/techplus/mods/do-a-barrel-roll-2.6.2+1.19.2-forge.jar	9	2026-04-27 18:44:49.57	2026-04-27 18:44:49.57
1315	rv1sovni	prgM2znB	/Users/alvinho/Server/techplus/mods/woodworks-1.19.2-2.2.2.jar	9	2026-04-27 18:44:49.609	2026-04-27 18:44:49.609
1316	YOs4tZea	OPV3tCmc	/Users/alvinho/Server/techplus/mods/xercapaint-1.19.2-1.0.2.jar	9	2026-04-27 18:44:49.637	2026-04-27 18:44:49.637
1317	UbFnAd4l	wdap0JAj	/Users/alvinho/Server/techplus/mods/create_jetpack-forge-3.4.2.jar	9	2026-04-27 18:44:49.665	2026-04-27 18:44:49.665
1318	bQh7xzFq	ANmCMdMt	/Users/alvinho/Server/techplus/mods/nerb-1.19.2-0.3-FORGE.jar	9	2026-04-27 18:44:49.694	2026-04-27 18:44:49.694
1319	NcUtCpym	v0vH7Baf	/Users/alvinho/Server/techplus/mods/XaerosWorldMap_1.39.12_Forge_1.19.1.jar	9	2026-04-27 18:44:49.73	2026-04-27 18:44:49.73
1320	o1C1Dkj5	vhbhPrpZ	/Users/alvinho/Server/techplus/mods/YungsBetterDungeons-1.19.2-Forge-3.2.2.jar	9	2026-04-27 18:44:49.767	2026-04-27 18:44:49.767
1321	NvZ9ZhwE	pwEa2yJ2	/Users/alvinho/Server/techplus/mods/AutoRegLib-1.8.2-55.jar	9	2026-04-27 18:44:49.793	2026-04-27 18:44:49.793
1322	ETKe9DNz	LebEybAw	/Users/alvinho/Server/techplus/mods/snowballsfreezemobs-1.19.2-3.3.jar	9	2026-04-27 18:44:49.82	2026-04-27 18:44:49.82
1323	bHkCoxMs	z4bZjSsw	/Users/alvinho/Server/techplus/mods/extendedbonemeal-1.19.2-3.4.jar	9	2026-04-27 18:44:49.851	2026-04-27 18:44:49.851
1324	iKRtwScn	OxJ3LkHD	/Users/alvinho/Server/techplus/mods/despawningeggshatch-1.19.2-4.3.jar	9	2026-04-27 18:44:49.876	2026-04-27 18:44:49.876
1325	jorDmSKv	ZVPHXuR1	/Users/alvinho/Server/techplus/mods/MagnumTorch-v4.2.3-1.19.2-Forge.jar	9	2026-04-27 18:44:49.902	2026-04-27 18:44:49.902
1326	40FYwb4z	hmlQQjAc	/Users/alvinho/Server/techplus/mods/caelus-forge-1.19.2-3.0.0.6.jar	9	2026-04-27 18:44:49.929	2026-04-27 18:44:49.929
1327	1iicrEO3	Skc3zBzk	/Users/alvinho/Server/techplus/mods/clayworks-1.19.2-2.1.0.jar	9	2026-04-27 18:44:49.983	2026-04-27 18:44:49.983
1328	p6y1z1Qa	z8KfF07r	/Users/alvinho/Server/techplus/mods/grindstonesharpertools-1.19.2-3.5.jar	9	2026-04-27 18:44:50.014	2026-04-27 18:44:50.014
1329	kidLKymU	aW1VWzje	/Users/alvinho/Server/techplus/mods/YungsBetterStrongholds-1.19.2-Forge-3.2.0.jar	9	2026-04-27 18:44:50.047	2026-04-27 18:44:50.047
1330	zTOq9jEI	jxnpwWtW	/Users/alvinho/Server/techplus/mods/torch-hit-forge-1.19.2-7.0.0.jar	9	2026-04-27 18:44:50.092	2026-04-27 18:44:50.092
1331	uO522mgw	wmgHQrOJ	/Users/alvinho/Server/techplus/mods/scaffoldingdropsnearby-1.19.2-3.2.jar	9	2026-04-27 18:44:50.121	2026-04-27 18:44:50.121
1332	YdVBZMNR	cA7V7gzZ	/Users/alvinho/Server/techplus/mods/justplayerheads-1.19.2-4.0.jar	9	2026-04-27 18:44:50.149	2026-04-27 18:44:50.149
1333	z9Ve58Ih	REe7auh2	/Users/alvinho/Server/techplus/mods/YungsBetterJungleTemples-1.19.2-Forge-1.0.1.jar	9	2026-04-27 18:44:50.193	2026-04-27 18:44:50.193
1334	3ESR84kR	7wB98NiB	/Users/alvinho/Server/techplus/mods/Item-Obliterator-Forge-1.19.2-2.2.1.jar	9	2026-04-27 18:44:50.221	2026-04-27 18:44:50.221
1335	RCVgMVGI	aqCItsah	/Users/alvinho/Server/techplus/mods/enderpearlswap-1.19.2-1.0.1.jar	9	2026-04-27 18:44:50.248	2026-04-27 18:44:50.248
1336	YWGP4Y1d	fvS0q7eV	/Users/alvinho/Server/techplus/mods/chalk-1.19.2-1.6.3.jar	9	2026-04-27 18:44:50.275	2026-04-27 18:44:50.275
1337	OC5Zubbe	CiuqKbEu	/Users/alvinho/Server/techplus/mods/keepmysoiltilled-1.19.2-2.2.jar	9	2026-04-27 18:44:50.304	2026-04-27 18:44:50.304
1338	cpqKG67r	8eNRNmfQ	/Users/alvinho/Server/techplus/mods/pattern_schematics-1.1.15+forge-1.19.2.jar	9	2026-04-27 18:44:50.332	2026-04-27 18:44:50.332
1339	hMlaZH8f	Aaxjk1hL	/Users/alvinho/Server/techplus/mods/sophisticatedstorage-1.19.2-0.9.7.765.jar	9	2026-04-27 18:44:50.376	2026-04-27 18:44:50.376
1340	i2kUe4lq	xch7dyzN	/Users/alvinho/Server/techplus/mods/fallingtrees-forge-mc1.19.2-0.13.2-SNAPSHOT.jar	9	2026-04-27 18:44:50.458	2026-04-27 18:44:50.458
1341	qnQsVE2z	8po5DGR8	/Users/alvinho/Server/techplus/mods/Quark-3.4-418.jar	9	2026-04-27 18:44:50.652	2026-04-27 18:44:50.652
1342	twkfQtEc	4R7I44b3	/Users/alvinho/Server/techplus/mods/moonlight-1.19.2-2.3.7-forge.jar	9	2026-04-27 18:44:50.687	2026-04-27 18:44:50.687
1343	iJNje1E8	BywGg9xj	/Users/alvinho/Server/techplus/mods/SnowRealMagic-1.19.2-forge-6.5.4.jar	9	2026-04-27 18:44:50.716	2026-04-27 18:44:50.716
1344	UblF21s1	sgQBX0tV	/Users/alvinho/Server/techplus/mods/Projectiles-1.0.0-1.19.2-Multi.jar	9	2026-04-27 18:44:50.747	2026-04-27 18:44:50.747
1345	jJthQvHv	bTxb1AAt	/Users/alvinho/Server/techplus/mods/majruszs-enchantments-forge-1.19.2-1.10.7-backport.1.jar	9	2026-04-27 18:44:50.772	2026-04-27 18:44:50.772
1346	W6ROj0Hl	jybCUL3J	/Users/alvinho/Server/techplus/mods/iChunUtil-1.19.2-Forge-1.0.3.jar	9	2026-04-27 18:44:50.806	2026-04-27 18:44:50.806
1347	r0v8vy1s	v9lKbHW6	/Users/alvinho/Server/techplus/mods/alternate-current-mc1.19-1.7.0.jar	9	2026-04-27 18:44:50.836	2026-04-27 18:44:50.836
1348	nmDcB62a	FqoRZlrr	/Users/alvinho/Server/techplus/mods/modernfix-forge-5.18.1+mc1.19.2.jar	9	2026-04-27 18:44:50.872	2026-04-27 18:44:50.872
1349	j6Zt3N7W	OGnDlRJa	/Users/alvinho/Server/techplus/mods/create_factory-0.0.2-1.19.2.jar	9	2026-04-27 18:44:50.9	2026-04-27 18:44:50.9
1350	u6dRKJwZ	LIkb8oaL	/Users/alvinho/Server/techplus/mods/jei-1.19.2-forge-11.8.1.1034.jar	9	2026-04-27 18:44:50.938	2026-04-27 18:44:50.938
1351	Wq5SjeWM	kQ220eh2	/Users/alvinho/Server/techplus/mods/fancymenu_forge_3.7.0_MC_1.19.2.jar	9	2026-04-27 18:44:51.031	2026-04-27 18:44:51.031
1352	BOCJKD49	Xw3rjCWU	/Users/alvinho/Server/techplus/mods/friendsandfoes-forge-mc1.19.2-3.0.9.jar	9	2026-04-27 18:44:51.095	2026-04-27 18:44:51.095
1353	yHN0njMr	Q4q0rf2I	/Users/alvinho/Server/techplus/mods/ends_delight-1.19.2-2.1.jar	9	2026-04-27 18:44:51.126	2026-04-27 18:44:51.126
1354	J81TRJWm	QMv1le10	/Users/alvinho/Server/techplus/mods/konkrete_forge_1.8.0_MC_1.19-1.19.2.jar	9	2026-04-27 18:44:51.16	2026-04-27 18:44:51.16
1355	4w0EzGRW	7NBgz9Ej	/Users/alvinho/Server/techplus/mods/Companion-1.19.2-forge-3.1.3.jar	9	2026-04-27 18:44:51.188	2026-04-27 18:44:51.188
1356	ts3qjo5t	u2H47I5t	/Users/alvinho/Server/techplus/mods/abnormals_delight-1.19.2-4.1.2.jar	9	2026-04-27 18:44:51.221	2026-04-27 18:44:51.221
1357	Kaov2qgi	fT2nOKrM	/Users/alvinho/Server/techplus/mods/easy-villagers-forge-1.19.2-1.1.23.jar	9	2026-04-27 18:44:51.25	2026-04-27 18:44:51.25
1358	E6867niZ	LZKMAa6P	/Users/alvinho/Server/techplus/mods/rechiseledcreate-1.0.2-forge-mc1.19.jar	9	2026-04-27 18:44:51.282	2026-04-27 18:44:51.282
1359	vvuO3ImH	uUAY30IE	/Users/alvinho/Server/techplus/mods/curios-forge-1.19.2-5.1.6.4.jar	9	2026-04-27 18:44:51.31	2026-04-27 18:44:51.31
1360	z3TzcquW	6yTegMt6	/Users/alvinho/Server/techplus/mods/fastpaintings-1.19-1.1.3.jar	9	2026-04-27 18:44:51.339	2026-04-27 18:44:51.339
1361	btq68HMO	xfrRlEVH	/Users/alvinho/Server/techplus/mods/create_central_kitchen-1.19.2-for-create-0.5.1.f-1.3.11.c.jar	9	2026-04-27 18:44:51.384	2026-04-27 18:44:51.384
1362	rOUBggPv	CjRX4qz1	/Users/alvinho/Server/techplus/mods/supermartijn642corelib-1.1.18-forge-mc1.19.2.jar	9	2026-04-27 18:44:51.416	2026-04-27 18:44:51.416
1363	x6r7yhfi	qAXckCmt	/Users/alvinho/Server/techplus/mods/labels-1.19.2-1.10.jar	9	2026-04-27 18:44:51.441	2026-04-27 18:44:51.441
1364	KNUSlHiU	cWbBHrVq	/Users/alvinho/Server/techplus/mods/BetterTridents-v4.0.2-1.19.2-Forge.jar	9	2026-04-27 18:44:51.477	2026-04-27 18:44:51.477
1365	rkN8aqci	8vNUDsod	/Users/alvinho/Server/techplus/mods/async-locator-forge-1.19.2-1.3.0.jar	9	2026-04-27 18:44:51.505	2026-04-27 18:44:51.505
1366	Z2mXHnxP	9iPMgrMe	/Users/alvinho/Server/techplus/mods/YungsBetterNetherFortresses-1.19.2-Forge-1.0.6.jar	9	2026-04-27 18:44:51.542	2026-04-27 18:44:51.542
1367	Df7RucLK	NpcBHs0g	/Users/alvinho/Server/techplus/mods/respiteful-1.1.2.c.jar	9	2026-04-27 18:44:51.573	2026-04-27 18:44:51.573
1368	qANg5Jrr	pRz52ujZ	/Users/alvinho/Server/techplus/mods/e4mc_minecraft-forge-5.4.1.jar	9	2026-04-27 18:44:51.615	2026-04-27 18:44:51.615
1369	exLPXAoq	C3yr7wWy	/Users/alvinho/Server/techplus/mods/create_ca-2.1 - 1.19.2.jar	9	2026-04-27 18:44:51.645	2026-04-27 18:44:51.645
1370	n6PXGAoM	9PPcvO4i	/Users/alvinho/Server/techplus/mods/betterstats-2.2.2+1.19.2.jar	9	2026-04-27 18:44:51.673	2026-04-27 18:44:51.673
1371	t5FRdP87	rAwSL8Wn	/Users/alvinho/Server/techplus/mods/YungsBetterWitchHuts-1.19.2-Forge-2.1.0.jar	9	2026-04-27 18:44:51.706	2026-04-27 18:44:51.706
1372	HjmxVlSr	K4G8SGWy	/Users/alvinho/Server/techplus/mods/YungsBetterMineshafts-1.19.2-Forge-3.2.1.jar	9	2026-04-27 18:44:51.737	2026-04-27 18:44:51.737
1373	6UbQDdoj	UPaFjw3e	/Users/alvinho/Server/techplus/mods/NMPR-1.19.2-1.1.1.jar	9	2026-04-27 18:44:51.762	2026-04-27 18:44:51.762
1374	vNNL5mc7	nFsnpwRv	/Users/alvinho/Server/techplus/mods/bedspreads-forge-6.0.0+1.19.2.jar	9	2026-04-27 18:44:51.789	2026-04-27 18:44:51.789
1375	9s6osm5g	qqCHdFw2	/Users/alvinho/Server/techplus/mods/cloth-config-8.3.134-forge.jar	9	2026-04-27 18:44:51.829	2026-04-27 18:44:51.829
1376	I2K4u1Q7	7JnXMAAf	/Users/alvinho/Server/techplus/mods/pluto-mc1.19.2-0.0.9.jar	9	2026-04-27 18:44:51.855	2026-04-27 18:44:51.855
1377	CU0PAyzb	nAUDoZw6	/Users/alvinho/Server/techplus/mods/Paxi-1.19.2-Forge-3.0.1.jar	9	2026-04-27 18:44:51.883	2026-04-27 18:44:51.883
1378	EltpO5cN	6ULhni05	/Users/alvinho/Server/techplus/mods/lootr-forge-1.19-0.4.29.76.jar	9	2026-04-27 18:44:51.917	2026-04-27 18:44:51.917
1379	vRYk0bv7	VLnMeNCk	/Users/alvinho/Server/techplus/mods/trashslot-forge-1.19.2-12.1.0.jar	9	2026-04-27 18:44:51.94	2026-04-27 18:44:51.94
1380	bUNifErl	6wUddnfy	/Users/alvinho/Server/techplus/mods/omgourd-1.19.2-4.3.0.16.jar	9	2026-04-27 18:44:51.967	2026-04-27 18:44:51.967
1381	c7m1mi73	dCEO67fT	/Users/alvinho/Server/techplus/mods/packetfixer-3.1.4-1.18-1.20.4-merged.jar	9	2026-04-27 18:44:51.994	2026-04-27 18:44:51.994
1382	eiktJyw1	3iWAsz1Y	/Users/alvinho/Server/techplus/mods/everycomp-1.19.2-2.5.35.jar	9	2026-04-27 18:44:52.051	2026-04-27 18:44:52.051
1383	GWp4jCJj	SNKifNYV	/Users/alvinho/Server/techplus/mods/createbigcannons-5.6.0+mc.1.19.2-forge.jar	9	2026-04-27 18:44:52.129	2026-04-27 18:44:52.129
1384	joEfVgkn	CE3MquDi	/Users/alvinho/Server/techplus/mods/carryon-forge-1.19.2-2.1.2.23.jar	9	2026-04-27 18:44:52.161	2026-04-27 18:44:52.161
1385	Vg5TIO6d	CLTrW9A5	/Users/alvinho/Server/techplus/mods/create_connected-0.9.4-mc1.19.2-all.jar	9	2026-04-27 18:44:52.261	2026-04-27 18:44:52.261
1386	6DdCzpTL	c7Wk5o4r	/Users/alvinho/Server/techplus/mods/mclogs-forge-1.4.2-1.19.jar	9	2026-04-27 18:44:52.288	2026-04-27 18:44:52.288
1387	Wl8l4Sim	IfmFbXO5	/Users/alvinho/Server/techplus/mods/BedBenefits-Forge-1.19.2-9.1.3.jar	9	2026-04-27 18:44:52.321	2026-04-27 18:44:52.321
1388	2VmW47Rp	1.5.1-forge-1.19	/Users/alvinho/Server/techplus/mods/KeepHeadNames-1.5.1-forge-1.19.jar	9	2026-04-27 18:44:52.348	2026-04-27 18:44:52.348
1389	NRjRiSSD	3w0IxNtk	/Users/alvinho/Server/techplus/mods/memoryleakfix-forge-1.17+-1.1.5.jar	9	2026-04-27 18:44:52.392	2026-04-27 18:44:52.392
1390	dQcfqGbl	vh4GHK4P	/Users/alvinho/Server/techplus/mods/cobweb-forge-1.19.2-1.0.1.jar	9	2026-04-27 18:44:52.431	2026-04-27 18:44:52.431
1391	O53VhQoZ	u8pJaV2E	/Users/alvinho/Server/techplus/mods/MyNethersDelight-1.19-1.7.jar	9	2026-04-27 18:44:52.465	2026-04-27 18:44:52.465
1392	mEEGbEIu	gD0PhYUh	/Users/alvinho/Server/techplus/mods/pandalib-forge-mc1.19.2-0.5.2-SNAPSHOT.jar	9	2026-04-27 18:44:52.503	2026-04-27 18:44:52.503
1393	qO4lsa4Y	a2OVeenK	/Users/alvinho/Server/techplus/mods/extendedgears-2.1.1-1.19.2-0.5.1.f-forge.jar	9	2026-04-27 18:44:52.534	2026-04-27 18:44:52.534
1394	hevpK888	DDO9WQES	/Users/alvinho/Server/techplus/mods/boatload-1.19.2-4.2.2.jar	9	2026-04-27 18:44:52.565	2026-04-27 18:44:52.565
1395	50dA9Sha	WhoErU2P	/Users/alvinho/Server/techplus/resourcepacks/FreshAnimations_v1.8.zip	9	2026-04-27 18:44:52.602	2026-04-27 18:44:52.602
1396	uuVy6k1s	2EHhuUtL	/Users/alvinho/Server/techplus/mods/molten_vents-1.19.2-2.0.8.jar	9	2026-04-27 18:44:52.63	2026-04-27 18:44:52.63
1397	ftdbN0KK	VTOW8XR6	/Users/alvinho/Server/techplus/mods/badpackets-forge-0.2.3.jar	9	2026-04-27 18:44:52.657	2026-04-27 18:44:52.657
1398	3dT9sgt4	Uehc7tGO	/Users/alvinho/Server/techplus/mods/YungsBetterOceanMonuments-1.19.2-Forge-2.1.1.jar	9	2026-04-27 18:44:52.701	2026-04-27 18:44:52.701
1399	P1Kv5EAO	txeRRjSH	/Users/alvinho/Server/techplus/mods/Necronomicon-Forge-1.4.2.jar	9	2026-04-27 18:44:52.726	2026-04-27 18:44:52.726
1400	OWSRM4vD	ssRHxD6e	/Users/alvinho/Server/techplus/mods/cofh_core-1.19.2-10.3.1.48.jar	9	2026-04-27 18:44:52.77	2026-04-27 18:44:52.77
1401	SfXIxvDu	6fOQd9fb	/Users/alvinho/Server/techplus/mods/iwtb-1.1.jar	9	2026-04-27 18:44:52.798	2026-04-27 18:44:52.798
1402	wLINU2AB	ZNlwakjv	/Users/alvinho/Server/techplus/mods/Measurements-forge-1.19.2-1.3.2.jar	9	2026-04-27 18:44:52.824	2026-04-27 18:44:52.824
1403	VYRu7qmG	nafMXhVc	/Users/alvinho/Server/techplus/mods/observable-3.3.1.jar	9	2026-04-27 18:44:52.856	2026-04-27 18:44:52.856
1404	ntMyNH8c	Oe3zPknB	/Users/alvinho/Server/techplus/mods/mysterious_mountain_lib-1.2.3-1.19.2.jar	9	2026-04-27 18:44:52.887	2026-04-27 18:44:52.887
1405	2WZWaKCl	hpnxAvUC	/Users/alvinho/Server/techplus/mods/berry_good-1.19.2-6.1.0.jar	9	2026-04-27 18:44:52.949	2026-04-27 18:44:52.949
1406	uSi0tajU	0.5.1	/Users/alvinho/Server/techplus/mods/rare-ice-0.5.1.jar	9	2026-04-27 18:44:52.974	2026-04-27 18:44:52.974
1407	HVnmMxH1	sAAjYvFB	/Users/alvinho/Server/techplus/shaderpacks/ComplementaryReimagined_r5.5.1.zip	9	2026-04-27 18:44:53.006	2026-04-27 18:44:53.006
1408	mSQF1NpT	vH9hd5hp	/Users/alvinho/Server/techplus/mods/elytraslot-forge-6.1.2+1.19.2.jar	9	2026-04-27 18:44:53.038	2026-04-27 18:44:53.038
1409	TyCTlI4b	1TblkbcZ	/Users/alvinho/Server/techplus/mods/sophisticatedbackpacks-1.19.2-3.20.2.1035.jar	9	2026-04-27 18:44:53.074	2026-04-27 18:44:53.074
1410	uy4Cnpcm	IL6yVQcP	/Users/alvinho/Server/techplus/mods/Bookshelf-Forge-1.19.2-16.3.20.jar	9	2026-04-27 18:44:53.103	2026-04-27 18:44:53.103
1411	Wnxd13zP	3GURrv52	/Users/alvinho/Server/techplus/mods/Clumps-forge-1.19.2-9.0.0+14.jar	9	2026-04-27 18:44:53.13	2026-04-27 18:44:53.13
1412	7L1HalIW	P23h60QI	/Users/alvinho/Server/techplus/mods/weakerspiderwebs-1.19.2-3.4.jar	9	2026-04-27 18:44:53.158	2026-04-27 18:44:53.158
1413	qa2H4BS9	kbjigmpt	/Users/alvinho/Server/techplus/mods/canary-mc1.19.2-0.3.3.jar	9	2026-04-27 18:44:53.191	2026-04-27 18:44:53.191
1414	nDFVOeq7	EWW1OsYx	/Users/alvinho/Server/techplus/mods/netherite_horse_armor-forge-1.19-1.0.4.jar	9	2026-04-27 18:44:53.218	2026-04-27 18:44:53.218
1415	ZYgyPyfq	Ltax470w	/Users/alvinho/Server/techplus/mods/YungsExtras-1.19.2-Forge-3.1.0.jar	9	2026-04-27 18:44:53.247	2026-04-27 18:44:53.247
1416	JWGBpFUP	KA5Gf4rg	/Users/alvinho/Server/techplus/mods/create_enchantment_industry-1.19.2-for-create-0.5.1.f-1.2.9.e.jar	9	2026-04-27 18:44:53.281	2026-04-27 18:44:53.281
1417	7uh75ruZ	OabgLyDQ	/Users/alvinho/Server/techplus/mods/kleeslabs-forge-1.19.2-12.3.0.jar	9	2026-04-27 18:44:53.309	2026-04-27 18:44:53.309
1418	ulloLmqG	b6EO57JG	/Users/alvinho/Server/techplus/mods/another_furniture-forge-1.19.2-2.1.4.jar	9	2026-04-27 18:44:53.361	2026-04-27 18:44:53.361
1419	8BmcQJ2H	lxzmD9V4	/Users/alvinho/Server/techplus/mods/geckolib-forge-1.19-3.1.40.jar	9	2026-04-27 18:44:53.422	2026-04-27 18:44:53.422
1420	fRiHVvU7	arXvHNCO	/Users/alvinho/Server/techplus/mods/emi-1.1.22+1.19.2+forge.jar	9	2026-04-27 18:44:53.462	2026-04-27 18:44:53.462
1421	g646EoqQ	k4jAIv2y	/Users/alvinho/Server/techplus/mods/cakechomps-forge-6.0.0+1.19.2.jar	9	2026-04-27 18:44:53.488	2026-04-27 18:44:53.488
1422	qbbO7Jns	VhcPzhEp	/Users/alvinho/Server/techplus/mods/emi_loot-0.6.6+fix4+1.19.2+forge.jar	9	2026-04-27 18:44:53.517	2026-04-27 18:44:53.517
1423	vY7Ka6pe	zcti3vd6	/Users/alvinho/Server/techplus/mods/glassbreaker-forge-1.4.0+1.18.2.jar	9	2026-04-27 18:44:53.548	2026-04-27 18:44:53.548
1424	QAGBst4M	UbCrBSit	/Users/alvinho/Server/techplus/mods/PuzzlesLib-v4.4.3-1.19.2-Forge.jar	9	2026-04-27 18:44:53.577	2026-04-27 18:44:53.577
1425	eIO12l2t	O9J4Ktag	/Users/alvinho/Server/techplus/mods/allurement-1.19.2-3.2.1.jar	9	2026-04-27 18:44:53.612	2026-04-27 18:44:53.612
1426	ordsPcFz	NBn3sEQk	/Users/alvinho/Server/techplus/mods/kotlinforforge-3.12.0-all.jar	9	2026-04-27 18:44:53.719	2026-04-27 18:44:53.719
1427	R2OftAxM	rFTKVUtq	/Users/alvinho/Server/techplus/mods/FarmersDelight-1.19.2-1.2.4.jar	9	2026-04-27 18:44:53.775	2026-04-27 18:44:53.775
1428	2n7aYFjU	28ahj8U6	/Users/alvinho/Server/techplus/mods/FiveHead-1.19.2-2.0.2.jar	9	2026-04-27 18:44:53.801	2026-04-27 18:44:53.801
1429	cE5SLYbv	rFrwOluN	/Users/alvinho/Server/techplus/mods/curiouslanterns-1.19.2-1.3.7.jar	9	2026-04-27 18:44:53.833	2026-04-27 18:44:53.833
1430	InYMuiQt	8qmVV9M7	/Users/alvinho/Server/techplus/mods/neapolitan-1.19.2-4.1.0.jar	9	2026-04-27 18:44:53.906	2026-04-27 18:44:53.906
1431	NCKpPR0Z	hOFm4e6B	/Users/alvinho/Server/techplus/mods/ecologics-forge-1.19.2-2.1.11.jar	9	2026-04-27 18:44:53.953	2026-04-27 18:44:53.953
1432	LNytGWDc	tJVykywJ	/Users/alvinho/Server/techplus/mods/create-1.19.2-0.5.1.i.jar	9	2026-04-27 18:44:54.113	2026-04-27 18:44:54.113
1433	YP9DjOvN	tj9wtOla	/Users/alvinho/Server/techplus/mods/tetra-1.19.2-5.6.0.jar	9	2026-04-27 18:44:54.17	2026-04-27 18:44:54.17
1434	ufdDoWPd	yQbhR062	/Users/alvinho/Server/techplus/mods/Kiwi-1.19.2-forge-8.3.6.jar	9	2026-04-27 18:44:54.202	2026-04-27 18:44:54.202
1435	7lrBqj5C	dVr87WJX	/Users/alvinho/Server/techplus/mods/superflatworldnoslimes-1.19.2-3.2.jar	9	2026-04-27 18:44:54.233	2026-04-27 18:44:54.233
1436	WrpuIfhw	ofDmBZke	/Users/alvinho/Server/techplus/mods/corpse-forge-1.19.2-1.0.17.jar	9	2026-04-27 18:44:54.26	2026-04-27 18:44:54.26
1437	WROfLLvn	rK1cR4Mh	/Users/alvinho/Server/techplus/mods/trading_floor-1.1.5+forge-1.19.2.jar	9	2026-04-27 18:44:54.29	2026-04-27 18:44:54.29
1438	e0M1UDsY	RKCtWE4y	/Users/alvinho/Server/techplus/mods/collective-1.19.2-7.64.jar	9	2026-04-27 18:44:54.321	2026-04-27 18:44:54.321
1439	rLLJ1OZM	ZgPJI4Kz	/Users/alvinho/Server/techplus/mods/coroutil-forge-1.19.2-1.3.6.jar	9	2026-04-27 18:44:54.347	2026-04-27 18:44:54.347
1440	aUp4r9hY	bettersafebed-forge-1.19-4	/Users/alvinho/Server/techplus/mods/bettersafebed-forge-1.19-4.jar	9	2026-04-27 18:44:54.376	2026-04-27 18:44:54.376
1441	Bh6ZOMvp	WO7QFUFi	/Users/alvinho/Server/techplus/mods/smarterfarmers-1.19.2-1.7.1.jar	9	2026-04-27 18:44:54.402	2026-04-27 18:44:54.402
1442	mT4tJQIo	ginoQfnO	/Users/alvinho/Server/techplus/mods/randomshulkercolours-1.19.2-3.2.jar	9	2026-04-27 18:44:54.433	2026-04-27 18:44:54.433
1443	owUiXPam	jrq6JT6B	/Users/alvinho/Server/techplus/mods/creeper_firework-1.19.2-1.2.0.jar	9	2026-04-27 18:44:54.46	2026-04-27 18:44:54.46
1444	t5W7Jfwy	pJSHElpS	/Users/alvinho/Server/techplus/mods/Pehkui-3.8.2+1.19.2-forge.jar	9	2026-04-27 18:44:54.492	2026-04-27 18:44:54.492
1445	SISoSFPP	A2wzQZLe	/Users/alvinho/Server/techplus/mods/ConfiguredDefaults-v8.0.1-1.20.1-Forge.jar	9	2026-04-27 18:44:54.518	2026-04-27 18:44:54.518
1446	15fFZ3f4	h9ixfoTK	/Users/alvinho/Server/techplus/mods/createframed-1.19.2-1.4.5.1.jar	9	2026-04-27 18:44:54.556	2026-04-27 18:44:54.556
1447	MBmh0f9A	6vuwab6O	/Users/alvinho/Server/techplus/mods/responsiveshields-2.3-mc1.18-19-20.x.jar	9	2026-04-27 18:44:54.582	2026-04-27 18:44:54.582
1448	Ua7DFN59	L5GqhLVE	/Users/alvinho/Server/techplus/mods/YungsApi-1.19.2-Forge-3.8.10.jar	9	2026-04-27 18:44:54.612	2026-04-27 18:44:54.612
1449	SaCpeal4	4xI610Ck	/Users/alvinho/Server/techplus/mods/comforts-forge-6.0.7+1.19.2.jar	9	2026-04-27 18:44:54.646	2026-04-27 18:44:54.646
1450	Eldc1g37	ziv1qJtR	/Users/alvinho/Server/techplus/mods/tcdcommons-2.2+1.19.2.jar	9	2026-04-27 18:45:33.475	2026-04-27 18:45:33.475
1451	z53V2L4P	YXklcDpN	/Users/alvinho/Server/techplus/mods/smoothboot(reloaded)-mc1.19.2-0.0.2.jar	9	2026-04-27 18:45:33.504	2026-04-27 18:45:33.504
1452	d6MhxwRo	OZrsQiRI	/Users/alvinho/Server/techplus/mods/soulfired-1.19.2-3.2.0.0-forge.jar	9	2026-04-27 18:45:33.535	2026-04-27 18:45:33.535
1453	gu7yAYhd	pCQZNkje	/Users/alvinho/Server/techplus/mods/cc-tweaked-1.19.2-1.101.3.jar	9	2026-04-27 18:45:33.557	2026-04-27 18:45:33.557
1454	AtT9wm5O	wkRh0MZp	/Users/alvinho/Server/techplus/mods/radiantgear-forge-2.0.4+1.19.2.jar	9	2026-04-27 18:47:24.869	2026-04-27 18:47:24.869
1461	Vebnzrzj	MBSY8toc	/Users/alvinho/Server/paper-1.21.8/plugins/LuckPerms-Bukkit-5.5.53.jar	1	2026-06-04 17:56:10.067	2026-06-04 17:56:10.067
1467	XRJBgd3p	ulQJdHkG	/Users/alvinho/Server/paper-1.21.8/plugins/NoChatReports-2.7.8.jar	1	2026-07-17 14:42:07.617	2026-07-17 14:42:07.617
1468	IjY7seTG	R1UjEyjz	/Users/alvinho/Server/paper-1.21.8/plugins/DistantHorizonsSupport-0.14.0.jar	1	2026-07-17 14:42:07.695	2026-07-17 14:42:07.695
1469	vtawPsTo	zHUNGRW7	/Users/alvinho/Server/paper-1.21.8/plugins/multiverse-netherportals-5.1.0-pre.jar	1	2026-07-17 14:42:07.856	2026-07-17 14:42:07.856
1470	cUhi3iB2	y4Ns2oTP	/Users/alvinho/Server/paper-1.21.8/plugins/tabtps-paper-1.4.1.jar	1	2026-07-17 14:42:07.9	2026-07-17 14:42:07.9
1471	TsLS8Py5	jPoqTGpe	/Users/alvinho/Server/paper-1.21.8/plugins/SkinsRestorer.jar	1	2026-07-17 14:42:08.141	2026-07-17 14:42:08.141
1472	NpvuJQoq	djLDmzj6	/Users/alvinho/Server/paper-1.21.8/plugins/ViaBackwards-5.11.1-SNAPSHOT.jar	1	2026-07-17 14:42:08.351	2026-07-17 14:42:08.351
1473	qvdtDX3s	BuvLmql9	/Users/alvinho/Server/paper-1.21.8/plugins/multiverse-inventories-5.3.5.jar	1	2026-07-17 14:42:08.509	2026-07-17 14:42:08.509
1474	3wmN97b8	PBjs38nY	/Users/alvinho/Server/paper-1.21.8/plugins/multiverse-core-5.7.3-pre.1.jar	1	2026-07-17 14:42:08.51	2026-07-17 14:42:08.51
1475	wKkoqHrH	U1DOZeks	/Users/alvinho/Server/paper-1.21.8/plugins/Geyser-Spigot.jar	1	2026-07-17 14:42:08.587	2026-07-17 14:42:08.587
1476	P1OZGk5p	CjleI5xo	/Users/alvinho/Server/paper-1.21.8/plugins/ViaVersion-5.11.1-SNAPSHOT.jar	1	2026-07-17 14:42:08.627	2026-07-17 14:42:08.627
\.


--
-- Data for Name: Server; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."Server" (id, path, "loaderType", "modType", version, "pluginPath", tag, port, "apiPort", "gameType", "startupScript") FROM stdin;
2	/Users/alvinho/Server/cobblemon-1.21.1	fabric	mod	1.21.1	/Users/alvinho/Server/cobblemon-1.21.1/mods	Cobblemon by Ariuan	{25565}	\N	minecraft	\N
1	/Users/alvinho/Server/paper-1.21.8	paper	plugin	1.21.11	/Users/alvinho/Server/paper-1.21.8/plugins	Ariuan's Server	{25565,19132}	6001	minecraft	\N
9	/Users/alvinho/Server/techplus	forge	mod	1.19.2	/Users/alvinho/Server/techplus/mods	Ariuan's Tech+	{25565}	\N	minecraft	./run.sh
\.


--
-- Data for Name: ServerAccess; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."ServerAccess" ("userId", "serverId") FROM stdin;
\.


--
-- Data for Name: Setting; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."Setting" ("serverId", type, name, value) FROM stdin;
1	serverCredit	playFee	6
1	serverCredit	startServerVoteFee	30
\.


--
-- Data for Name: Ticket; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."Ticket" (description, name, effect, id, "effectData") FROM stdin;
First Ticket Created through Discord!	Test Ticket	multiplier	test	{"factor": 0.4}
Let's celebrate the brand new server together! The server runs on 1.21.1, install the cobblemon modpack in advance!	Celebrate Cobblemon by Ariuan!	fixed_credit	cobblemonCelebration	{"amount": 5}
You have helped to build our witch farm! This is my gift to you	Witch Farm Builder	free_under_cost	witchFarmHelper	{"threshold": 25}
Enjoy 40% off of your cost during holidays!	Happy Holiday!	multiplier	holiday	{"factor": 0.6}
It's time to play Minecraft after school resumed	Back to School	repeat_approve	backtoschool	{"maxCount": 3}
\N	Pay Less Play More	custom_approval_count	forceOpen	{"count": 1}
Fuck it yeah	Bye Bye DSE	custom_approval_count	dse	{"count": 1}
Enjoy hours of server without a penny!	Holiday Extra	free_play	holidayExemption	{"hours": 4}
\.


--
-- Data for Name: TicketHistory; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."TicketHistory" (id, "ticketId", action, reason, "timestamp") FROM stdin;
1d1b41de-fb08-402e-bae6-43b2a73168d2	e8f02ad3-42b5-4cea-8077-018f81d646ff	use	New Start Server Poll	2025-12-10 13:21:54.437
8b414a40-7479-4c00-8e0c-12e4be69bd27	e8f02ad3-42b5-4cea-8077-018f81d646ff	use	Approval Poll Reaction: Start Server at Cobblemon by Ariuan	2025-12-10 13:22:13.38
a62edd7e-f998-4710-914a-f5df5817b2a5	1413c9f4-9f45-4e38-af87-56835be049d2	use	Check credit of user wingwing	2025-12-11 12:17:30.095
f7880749-0c27-4c4c-b387-122448b1019a	c0f2aefa-fae4-4370-acff-8e6cc539d6c3	use	Check credit of user wingwing	2025-12-11 12:28:58.954
8a0bb7f1-8d5c-4771-abfa-4378d5b28295	8ec53680-dd85-4901-9c3f-67770d8a9f86	use	Approval Poll Reaction: kill generral	2026-01-30 14:27:26.457
7780c9ea-9a7c-4893-ae96-4efc08dbd19e	f016c90d-eee1-4093-abf0-6a1c2bbbdc99	use	Approval Poll Reaction: kill generral	2026-01-30 14:34:24.287
24078776-4ee0-420d-9c6b-637ee76c0e20	b6effafb-3a91-40df-b6cc-1e97d65f55b1	use	New Start Server Poll	2026-01-31 15:27:22.474
293c7c9e-d271-41b3-a093-d9862aa9f784	70153b3a-b464-41c6-928b-2efa61dfe4de	use	Approval Poll Reaction: Start Server at Ariuan's Server	2026-01-31 15:30:00.06
85d78cf2-c1ef-4b9c-b4c7-aba248f487be	f016c90d-eee1-4093-abf0-6a1c2bbbdc99	use	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-01 11:33:04.348
20de7765-abdf-421a-91a8-d125b7cc5c69	f016c90d-eee1-4093-abf0-6a1c2bbbdc99	use	New Start Server Poll	2026-02-01 11:49:52.312
c2ad45a9-042a-433d-99c1-08bc9050e9c8	f016c90d-eee1-4093-abf0-6a1c2bbbdc99	use	Approval Poll Reaction: Start Server at Cobblemon by Ariuan	2026-02-01 11:51:43.521
8d629f43-092d-40dc-9ec1-18a6f975b91c	81312c4b-224f-42c4-9aa4-3d829fc555cc	use	Upload Custom Mod to Server	2026-02-02 17:17:15.935
8d3c53fe-ddbe-44f5-9dde-c67ddf99a559	81312c4b-224f-42c4-9aa4-3d829fc555cc	use	Upload Custom Mod to Server	2026-02-02 17:19:10.644
1b5cabf2-9bb7-42eb-b58c-02d81b5644fe	81312c4b-224f-42c4-9aa4-3d829fc555cc	use	Upload Custom Mod to Server	2026-02-02 17:20:50.657
bf21af06-9939-4e21-97ee-2fc63e752135	81312c4b-224f-42c4-9aa4-3d829fc555cc	use	Upload Custom Mod to Server	2026-02-02 17:24:04.663
aa2cecfa-4e16-4de9-99d6-fd4c39dea08e	70153b3a-b464-41c6-928b-2efa61dfe4de	use	Approval Poll Reaction: ban generral	2026-02-05 08:07:35.301
e22c6885-6104-4ce3-8558-90efe2262385	f016c90d-eee1-4093-abf0-6a1c2bbbdc99	use	List Files (root)	2026-02-05 14:40:58.371
90b84bca-279e-4bd0-bf5c-ef69e492f7d7	70153b3a-b464-41c6-928b-2efa61dfe4de	use	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-08 08:11:07.324
7193d45e-6ec3-42df-9fe4-ef7317680545	c2bcf7df-ffb5-4087-bbde-f57029cd935e	use	New Start Server Poll	2026-02-17 16:00:10.244
fc4b965d-ae0e-49ed-995f-bad2da787b34	4c53033f-ab80-4ad2-bb2f-d569adab81cf	use	Used via /useticket command	2026-02-17 16:02:51.941
5b2624a3-1172-4a31-a02d-9267a1dfcbac	0b44d997-9c85-4077-9354-e11bc614035d	use	Used via /useticket command	2026-02-18 15:02:04.393
d7ba4e7d-9572-41fb-b8a3-e3d8ccd9a7e4	3946580e-4a60-4557-82dc-62df0489ac98	use	New Start Server Poll	2026-02-18 15:16:23.42
decc90b0-d478-4021-a690-b394649cd97d	0b44d997-9c85-4077-9354-e11bc614035d	use	Used via /useticket command	2026-02-18 15:23:33.064
fc67fe14-c399-499f-b4f2-18dc4214bd44	67b02055-f17f-4f7a-9c11-aba87477954f	use	Used via /useticket command	2026-02-21 10:25:45.505
e566ca30-a4a5-49b6-9e05-42c00303a4a3	e5574fc0-455b-4a0f-9a48-4a945687c5c6	use	New Start Server Poll	2026-02-23 13:57:34.03
a82cc79e-cc3b-4d0b-954c-bafcd9527ada	4f0b1ef3-4dd5-4cd5-93ad-98bf99ef9213	use	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-23 13:57:47.298
9f2d5477-e797-4d5d-b566-d8c813315cf2	4f0b1ef3-4dd5-4cd5-93ad-98bf99ef9213	use	New Start Server Poll	2026-02-23 14:06:20.649
97034945-1127-44bc-8f72-c8624e369eb0	7b7a016d-3260-44d4-84e4-024d1e009e6e	use	New Start Server Poll	2026-02-23 14:06:20.649
83deed57-6091-47c9-9a5d-72904e35f2fa	bc648567-8a06-4556-81ab-233d490bcffc	use	New Start Server Poll	2026-02-23 14:06:20.649
aebbd28d-75ea-4af6-bb33-561ff84716da	9250ff7e-0914-42ce-8fce-57d7093cec44	use	New Start Server Poll	2026-02-23 14:06:20.649
b685e400-a0a5-49a6-8775-8dbefc93c4f1	6b5a4c3a-3cef-483e-9def-6b544ddd864f	use	New Start Server Poll	2026-02-23 14:06:20.649
4cabbd27-2c98-4458-b6c6-5c2c6574c78a	3d67b50b-9b31-4aea-8c42-8e18e0787763	use	New Start Server Poll	2026-02-23 14:06:20.649
66b243ce-a2ca-49c0-b7fe-2255830dd663	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-04-25 09:54:36.946
543e2adb-da4a-4312-9517-57a387ce6d0c	c01f32ab-4888-44d1-8b8b-3f4b95714515	use	Used via /useticket command	2026-04-25 10:02:41.267
60159d0d-5ee5-4f29-b74a-d6723a55ec5e	c01f32ab-4888-44d1-8b8b-3f4b95714515	use	Used via /useticket command	2026-04-25 10:06:59.327
babc6746-18ce-403b-8c81-5acc7fd738c6	c01f32ab-4888-44d1-8b8b-3f4b95714515	use	Used via /useticket command	2026-04-25 10:24:01.083
e90d17e2-8e31-4a85-ab86-429fc3d90d5d	401673ac-0c05-4fdf-813f-bd21be200b07	use	New Start Server Poll	2026-04-26 07:36:21.989
2da6cb2e-5c17-4a58-b1b2-5e29ed616e48	401673ac-0c05-4fdf-813f-bd21be200b07	use	Approval Poll Reaction: Start Server at Ariuan's Server	2026-04-26 07:36:37.288
4caa4fca-b005-4fe0-a634-43624d3c872a	401673ac-0c05-4fdf-813f-bd21be200b07	use	New Start Server Poll	2026-04-26 09:38:17.956
1970839e-b8b5-4dd0-a24a-f19cf8549617	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-04-26 09:39:33.03
ecf6939f-af5e-4a2f-beab-a4de04d6a8a8	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-04-26 14:44:52.968
e68c8066-821c-4c53-94d0-8803410bca54	60782bf3-3510-4d8c-a137-1fa19c79ba8e	use	New Start Server Poll	2026-04-26 14:46:12.948
5696de64-2c05-459a-9ee3-6fb629b59cf3	60782bf3-3510-4d8c-a137-1fa19c79ba8e	use	New Start Server Poll	2026-04-26 14:49:04.984
cff6719a-ad6b-4152-bdf1-0cc7e612b122	38caffa0-a420-44ed-bf2e-51da96b7593f	use	Approval Poll Reaction: Start Server at Ariuan's Server	2026-04-26 14:49:49.331
013d1a56-e622-42aa-892b-c0b688e5b22c	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-04-26 18:39:49.17
d2abaa3e-2111-4c70-ae54-0380d2fa010c	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-04-27 08:49:39.239
f6f06e5d-5b35-4b9d-9468-20e332bec095	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-04-28 05:58:50.392
48431fc2-872a-4e35-afca-55e87e7ea694	60782bf3-3510-4d8c-a137-1fa19c79ba8e	use	New Start Server Poll	2026-04-28 05:59:27.691
75c81fc6-a6db-41f0-8d9d-27cbdc2f8b3e	e8b6b7aa-fa52-434a-a984-977d091fcc1c	use	Approval Poll Reaction: Start Server at Ariuan's Server	2026-04-28 05:59:47.998
5c6a7e8e-711f-441b-b096-1de3c82491de	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-04-28 12:54:31.199
76be9389-c950-43af-a24e-0cd4940d5995	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-05-01 07:40:52.478
1a11919a-ba8e-4533-88b1-cde5308df592	b309fc3c-6e81-4061-8271-bc8c81a210f2	use	New Start Server Poll	2026-05-01 07:41:23.246
cfdfd581-c55e-47c2-b395-392434978e50	4df7dbaf-55ca-42e7-994c-a94fc22f30f1	use	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-01 07:41:43.149
acfcbe3c-97c5-4386-bbab-4778ee7a9604	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-05-01 15:51:36.329
ebb2c519-354d-4ec7-87f0-88333fc6e0e9	c01f32ab-4888-44d1-8b8b-3f4b95714515	use	Used via /useticket command	2026-05-04 16:41:33.038
20496f3a-a191-4a70-a195-b738b6bc006e	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-05-05 06:28:10.626
cc8dbcfe-0ba0-4e8c-8088-017c969a4382	0e148b66-5060-4a3e-b1dc-164991edaad0	use	New Start Server Poll	2026-05-05 06:29:01.443
3c449107-85a5-4e44-81ee-4b42b9fff067	8d99e238-6682-4fa6-bdc6-ca525ba16404	use	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-05 06:29:19.084
a6d7c869-6d9b-4e9a-a639-961784ada8b5	8d99e238-6682-4fa6-bdc6-ca525ba16404	use	New Start Server Poll	2026-05-05 06:32:45.519
9de85105-4e26-4f9b-9a90-33a0afdcf2e9	8d99e238-6682-4fa6-bdc6-ca525ba16404	use	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-05 06:33:00.066
9b66ff8d-aac1-4297-8271-2c9229f33dc6	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-05-05 10:29:40.092
e99e0ee9-ff6e-4623-a077-812a26336464	8d99e238-6682-4fa6-bdc6-ca525ba16404	use	New Start Server Poll	2026-05-06 09:06:28.83
79ff1e32-cc66-4718-a410-1991ba630adb	8d99e238-6682-4fa6-bdc6-ca525ba16404	use	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-06 09:06:45.306
40cc3420-287b-4644-9fa1-8196d3e2b8a3	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-05-06 09:07:03.25
54baf2f3-e6ee-41cf-8f71-73046bbeb97e	1f27deee-1f19-42cb-8cad-d9dda1418e9b	use	Used via /useticket command	2026-05-06 12:12:58.413
255f84dd-4493-4823-a70d-3cfc3894961b	0d66f4e9-5655-479f-81ff-f6a99482e910	use	Used via /useticket command	2026-05-07 08:36:00.929
d4e641cf-3476-4b46-aff7-3bd9ed115a3f	8d99e238-6682-4fa6-bdc6-ca525ba16404	use	New Start Server Poll	2026-05-07 08:38:03.332
df7389d7-43a4-4a67-b817-9883e6fa0dbd	8d99e238-6682-4fa6-bdc6-ca525ba16404	use	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-07 08:39:07.783
6837669d-7bab-44a1-a8e3-1e14c0a9d6e5	8d99e238-6682-4fa6-bdc6-ca525ba16404	use	New Start Server Poll	2026-05-08 07:43:09.511
614144c8-21ae-4c14-84f8-75c101bd7818	016396d6-8e66-4ca1-a31e-2f467e0094b6	use	Used via /useticket command	2026-05-08 12:13:54.597
9530df4d-272d-48c0-a108-91d623f6bd38	8d99e238-6682-4fa6-bdc6-ca525ba16404	use	New Start Server Poll	2026-05-12 12:01:57.775
43edb1a0-91dc-4092-9e16-8bd6b6ec5df3	8d99e238-6682-4fa6-bdc6-ca525ba16404	use	New Start Server Poll	2026-05-13 12:29:01.664
8bb400fc-d463-41b7-b7fa-ebc5e9f7383e	016396d6-8e66-4ca1-a31e-2f467e0094b6	use	Used via /useticket command	2026-05-13 12:29:29.154
9873aa5a-28dc-40d7-95f7-1f1d5b2673bf	016396d6-8e66-4ca1-a31e-2f467e0094b6	use	Used via /useticket command	2026-05-15 10:56:34.365
32e1706f-b8bb-4dd4-99dd-b546f4c7133c	016396d6-8e66-4ca1-a31e-2f467e0094b6	use	Used via /useticket command	2026-05-17 09:41:41.673
3103a568-d54a-4571-8a69-8b0d8955fa6b	016396d6-8e66-4ca1-a31e-2f467e0094b6	use	Used via /useticket command	2026-05-20 07:31:49.866
6027ef57-b10a-40f0-adbb-cce82cd059db	016396d6-8e66-4ca1-a31e-2f467e0094b6	use	Used via /useticket command	2026-05-21 11:43:00.928
\.


--
-- Data for Name: Transaction; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."Transaction" (id, amount, "beforeAmount", "afterAmount", reason, "timestamp", "userId", "serverId", "finalAmount", "relatedTicketHistoryId", "ticketId") FROM stdin;
1a95706d-d157-43a3-87ad-4f3cc43a0b82	40	0	40	Set by admin	2025-04-27 09:28:11.026	804333943775559680	\N	\N	\N	\N
2d93c38e-64b0-4f36-a751-2e6c3327c81e	0	40	40	Set by admin	2025-04-27 09:33:47.422	804333943775559680	\N	\N	\N	\N
74a220de-dcdf-457c-a92d-39bd59c410c2	-35	40	5	Jackpot Payment	2025-04-27 11:17:50.663	804333943775559680	\N	\N	\N	\N
714ba91c-a296-41ea-b81d-29760cba5463	20	5	25	Daily Gift	2025-04-28 06:00:04.753	804333943775559680	\N	\N	\N	\N
f72d9d5c-d74f-45c9-bbc3-8e1f6932cb64	20	25	45	Daily Gift	2025-04-29 06:00:03.76	804333943775559680	\N	\N	\N	\N
9b333404-c3a7-46e1-b9fe-710189e84bc4	20	45	65	Daily Gift	2025-04-30 06:00:03.986	804333943775559680	\N	\N	\N	\N
d831394d-e7d6-431d-89bd-29167c15be9d	20	65	85	Daily Gift	2025-05-01 06:00:03.744	804333943775559680	\N	\N	\N	\N
1bbb3e8b-478f-4666-8e4c-67c2a8853c2c	-15	85	70	Approval Reaction	2025-06-21 08:12:49.707	804333943775559680	\N	\N	\N	\N
e3d79d58-39c6-4177-ad10-3f590db28370	-15	70	55	Approval Reaction	2025-06-21 08:27:50.64	804333943775559680	\N	\N	\N	\N
351e3c4a-0a76-4bae-813b-bc8d8eae0646	20	55	75	Daily Gift	2025-06-22 06:00:09.267	804333943775559680	\N	\N	\N	\N
4f4dc92a-6bd7-489a-bca0-730cb51cc6af	-60	80	20	Jackpot Payment	2025-05-06 03:20:29.589	709605543358234674	\N	\N	\N	\N
fc0bffcf-1317-47e9-ab01-01aebf737dcd	20	60	80	Daily Gift	2025-04-29 06:00:01.622	709605543358234674	\N	\N	\N	\N
9dd0302b-3806-4e56-955b-13b716f5f99e	20	40	60	Daily Gift	2025-04-28 06:00:01.655	709605543358234674	\N	\N	\N	\N
13a14f08-61f8-4989-98c4-40bd6510e681	40	0	40	Set by admin	2025-04-27 09:33:47.42	709605543358234674	\N	\N	\N	\N
a328419c-c85b-4bcc-9fe8-28dbf2398f92	540	20	560	Changed by admin	2025-05-06 05:27:33.174	709605543358234674	\N	\N	\N	\N
febde61e-a514-426b-a80d-5dac5bacd284	-100	560	460	Jackpot Payment	2025-05-06 13:27:19.204	709605543358234674	\N	\N	\N	\N
0256819c-1d24-4322-aaa4-b17888f22303	-100	460	360	Jackpot Payment	2025-05-06 13:28:03.249	709605543358234674	\N	\N	\N	\N
8704cd3f-883a-4ea0-a7ef-66fdd8046a93	-25	360	335	Jackpot Payment	2025-05-10 15:07:27.405	709605543358234674	\N	\N	\N	\N
b1d1fc2e-f93d-4335-b6e3-2001a4af99a0	200	40	240	Received Transfer Credit	2025-04-27 10:53:25.054	678185861275189258	\N	\N	\N	\N
8b39bd3c-d8f2-4115-ae05-1d21f32a8201	40	0	40	Set by admin	2025-04-27 09:33:47.421	678185861275189258	\N	\N	\N	\N
8fe8f427-2b1e-4000-820c-ffac2827739c	50	240	290	Received Transfer Credit	2025-04-27 12:32:10.899	678185861275189258	\N	\N	\N	\N
0a4282df-f55e-4a7a-bcfe-97172fc74969	40	0	40	Set by admin	2025-04-27 09:33:47.421	950063797358428260	\N	\N	\N	\N
50a3938e-c0c8-49de-942f-14ed76f9b114	20	40	60	Daily Gift	2025-04-28 06:00:05.169	950063797358428260	\N	\N	\N	\N
a7b7ac3c-7176-456e-9311-71dd1468e4c1	20	60	80	Daily Gift	2025-04-29 06:00:06.861	950063797358428260	\N	\N	\N	\N
a80d9ad5-2c3d-4369-b4e6-d572bd75b1b3	-15	80	65	Approval Reaction	2025-06-16 17:01:56.189	950063797358428260	\N	\N	\N	\N
c26b00c5-8c49-4a19-a3cd-223e24553588	-15	561	546	Approval Reaction	2025-06-21 08:12:16.092	844193954756689921	\N	\N	\N	\N
005b7e19-409f-4aa1-888d-9dd37a04a0f0	-15	576	561	Approval Reaction	2025-06-16 17:00:04.616	844193954756689921	\N	\N	\N	\N
34368d11-9785-4d29-a099-14f0d0f101c2	540	36	576	Changed by admin	2025-05-06 05:26:52.565	844193954756689921	\N	\N	\N	\N
c600e6ab-9bb1-4fbf-a188-76d85678bed5	20	16	36	Daily Gift	2025-05-05 06:00:02.418	844193954756689921	\N	\N	\N	\N
a8f7ca0e-4dcb-4666-813f-8db34660018c	-70	86	16	Jackpot Payment	2025-05-04 07:52:03.725	844193954756689921	\N	\N	\N	\N
cf10cfb1-3a36-4a97-9ed7-d8ff8b7f5cef	20	66	86	Daily Gift	2025-05-04 06:00:03.031	844193954756689921	\N	\N	\N	\N
c064bd5f-bc01-452b-a5c0-b9a50d0e2b7e	20	46	66	Daily Gift	2025-05-03 06:00:01.566	844193954756689921	\N	\N	\N	\N
c978cdf4-ed65-42d1-8039-73819be58580	20	26	46	Daily Gift	2025-05-02 06:00:02.642	844193954756689921	\N	\N	\N	\N
572a5e51-111d-488d-ac15-6a7d95a29ea0	20	6	26	Daily Gift	2025-05-01 06:00:02.171	844193954756689921	\N	\N	\N	\N
b423e6b8-bc41-46e2-9094-cca0ad89f1e9	-15	21	6	Approval Reaction	2025-04-30 15:27:36.989	844193954756689921	\N	\N	\N	\N
402b3843-66b3-40ee-bf1b-9d3085d9dcfb	-55	76	21	Jackpot Payment	2025-04-30 07:24:32.153	844193954756689921	\N	\N	\N	\N
071784fc-4f21-4434-b9c2-f08827287899	20	56	76	Daily Gift	2025-04-30 06:00:01.72	844193954756689921	\N	\N	\N	\N
723d69fd-e518-4cc3-a7ae-aded060931dc	20	36	56	Daily Gift	2025-04-29 06:00:01.065	844193954756689921	\N	\N	\N	\N
e892825f-c228-409a-a042-026887037e3e	20	16	36	Daily Gift	2025-04-28 06:00:00.954	844193954756689921	\N	\N	\N	\N
3f90cc71-c287-4bfd-8186-ab67f0c40f51	-9	25	16	Transfer Credit	2025-04-28 03:27:03.033	844193954756689921	\N	\N	\N	\N
69517565-b354-406f-8e84-d60e53201d68	-15	40	25	Approval Reaction	2025-04-28 03:24:29.35	844193954756689921	\N	\N	\N	\N
f1171ed8-4075-4bcd-b0bd-8b797e82226b	40	0	40	Set by admin	2025-04-27 09:33:47.422	844193954756689921	\N	\N	\N	\N
cb64d07b-b395-4b36-a597-943ab440abd4	-15	546	531	Approval Reaction	2025-06-21 08:27:42.783	844193954756689921	\N	\N	\N	\N
cdd38ad7-94ea-4c46-b121-caaa21c17df0	40	0	40	Set by admin	2025-04-27 09:33:47.422	841246467536584704	\N	\N	\N	\N
4e94f5a5-3dbd-4979-a48a-f64836d300ef	20	40	60	Daily Gift	2025-04-28 06:00:06.166	841246467536584704	\N	\N	\N	\N
1450bff0-630e-4080-8026-122d6275bfd0	20	60	80	Daily Gift	2025-04-29 06:00:07.235	841246467536584704	\N	\N	\N	\N
3be2956f-19b2-481b-a0ba-cfb0f8f0af50	-15	60	45	Approval Reaction	2025-04-30 15:41:32.971	645919565758464010	\N	\N	\N	\N
e84a3df5-48e2-4f66-b00d-499fdd817c0e	20	40	60	Daily Gift	2025-04-30 06:00:01.161	645919565758464010	\N	\N	\N	\N
e4de76b8-41b0-47d7-a554-2eb303bb6ea9	20	20	40	Daily Gift	2025-04-29 06:00:00.329	645919565758464010	\N	\N	\N	\N
ebcbe96a-2f4b-4baf-b3e6-01d0a4802819	20	0	20	Daily Gift	2025-04-28 06:00:00.211	645919565758464010	\N	\N	\N	\N
6fba3501-aea8-43ca-a9b0-1c83ffbd8564	-15	15	0	Approval Reaction	2025-04-28 03:27:05.319	645919565758464010	\N	\N	\N	\N
6f9f512b-d90d-4ead-b4ae-237e267f8a80	5	10	15	Received Transfer Credit	2025-04-28 03:27:03.034	645919565758464010	\N	\N	\N	\N
6eed6b65-e2af-4b20-b626-3a35a6fd5b8b	-30	40	10	New Start Server Poll	2025-04-28 03:24:24.255	645919565758464010	\N	\N	\N	\N
2b4eb5e5-4af0-4079-a3ac-27f338500235	40	0	40	Set by admin	2025-04-27 09:33:47.423	645919565758464010	\N	\N	\N	\N
2cadbfd6-1fcf-49ba-8d2d-d37900f6261b	20	45	65	Daily Gift	2025-05-01 06:00:01.591	645919565758464010	\N	\N	\N	\N
c49809b1-be16-4b77-9738-7bdce3fdfb58	20	65	85	Daily Gift	2025-05-02 06:00:01.813	645919565758464010	\N	\N	\N	\N
3d80bd09-0df4-400d-b537-381c6f639f7a	-35	85	50	Jackpot Payment	2025-05-06 05:47:35.997	645919565758464010	\N	\N	\N	\N
1d6dca16-4e90-4253-975b-26892be8b7bc	20	50	70	Daily Gift	2025-05-06 06:00:03.465	645919565758464010	\N	\N	\N	\N
629a1d3f-ee0a-4e73-a428-b229678e4f46	20	70	90	Daily Gift	2025-05-07 06:00:03.112	645919565758464010	\N	\N	\N	\N
21ddcb9b-d230-4c17-94f7-14389a5d26ad	-50	90	40	Jackpot Payment	2025-05-08 10:20:35.614	645919565758464010	\N	\N	\N	\N
d4805018-4b9a-43b1-98df-b3d16918c058	20	40	60	Daily Gift	2025-05-09 06:00:03.601	645919565758464010	\N	\N	\N	\N
729135ed-d103-4b55-8fd3-93a1139694e9	20	60	80	Daily Gift	2025-05-10 06:00:03.924	645919565758464010	\N	\N	\N	\N
66ecfa1f-ec40-482e-881c-af86fc3ad238	-80	80	0	Jackpot Payment	2025-05-12 04:00:22.59	645919565758464010	\N	\N	\N	\N
888b5b20-8346-4e7b-b651-edfbb9cc3e20	20	0	20	Daily Gift	2025-05-12 06:00:04.482	645919565758464010	\N	\N	\N	\N
b08d43d0-1a73-4ad3-a9a3-b1eb88efe693	20	20	40	Daily Gift	2025-05-13 06:00:04.828	645919565758464010	\N	\N	\N	\N
d2e86d3b-6bb1-424a-83ae-510eaf5d5299	20	40	60	Daily Gift	2025-05-14 06:00:05.201	645919565758464010	\N	\N	\N	\N
40c5c35e-d278-415b-8474-0630fad2991c	20	60	80	Daily Gift	2025-05-15 06:00:05.376	645919565758464010	\N	\N	\N	\N
03fe9da7-136b-4d3d-ac11-3bc5d2f93285	-60	80	20	Jackpot Payment	2025-05-16 08:19:49.26	645919565758464010	\N	\N	\N	\N
a1ee0fdb-5ee6-4688-bfa8-7a867490c7e2	20	20	40	Daily Gift	2025-05-17 06:00:06.299	645919565758464010	\N	\N	\N	\N
11f45d28-65a9-4490-a79c-952b172b25c9	20	40	60	Daily Gift	2025-05-18 06:00:06.563	645919565758464010	\N	\N	\N	\N
f16159b2-5b79-4c54-b608-8354ecd4450e	20	60	80	Daily Gift	2025-05-19 06:00:06.83	645919565758464010	\N	\N	\N	\N
cb9bbf2f-52e2-439b-91fe-91f0fea6de62	-15	20	5	Approval Reaction	2025-04-30 15:16:40.611	780972375394091009	\N	\N	\N	\N
3f9a8b75-5775-467f-a77c-ecbbe6cc3054	-30	50	20	New Start Server Poll	2025-04-30 15:14:14.894	780972375394091009	\N	\N	\N	\N
f592fcd8-ce63-413a-a11b-9204921965fa	20	30	50	Daily Gift	2025-04-30 06:00:02.445	780972375394091009	\N	\N	\N	\N
f888dd2d-809b-45be-9557-70501cf7e137	-35	65	30	Jackpot Payment	2025-04-29 09:03:20.644	780972375394091009	\N	\N	\N	\N
ea50c8df-2df1-4588-b1df-21980011dd0d	20	45	65	Daily Gift	2025-04-29 06:00:02.092	780972375394091009	\N	\N	\N	\N
74618a59-6959-4102-9d85-61fb96e2646f	20	25	45	Daily Gift	2025-04-28 06:00:02.458	780972375394091009	\N	\N	\N	\N
d15fb7c6-33a3-469b-8967-52bcc09e8427	-15	40	25	Approval Reaction	2025-04-28 03:25:00.257	780972375394091009	\N	\N	\N	\N
351c4b49-9685-4851-b1fa-433fadcadb72	40	0	40	Set by admin	2025-04-27 09:33:47.423	780972375394091009	\N	\N	\N	\N
65f62918-294a-4195-bac5-1999f3b65c95	20	5	25	Daily Gift	2025-05-01 06:00:02.526	780972375394091009	\N	\N	\N	\N
98bd53b1-8cf7-4975-8169-b89f87ec7637	20	25	45	Daily Gift	2025-05-02 06:00:03.03	780972375394091009	\N	\N	\N	\N
e8192d7c-95f1-40a9-a930-5005ba5481a5	20	45	65	Daily Gift	2025-05-03 06:00:02.227	780972375394091009	\N	\N	\N	\N
b524bd59-ab7e-44a1-853d-c4c2a8c85325	20	65	85	Daily Gift	2025-05-04 06:00:03.573	780972375394091009	\N	\N	\N	\N
68901b70-bc27-4bf1-9790-f7220f59e5a3	-30	85	55	New Start Server Poll	2025-06-16 16:59:55.168	780972375394091009	\N	\N	\N	\N
0e6e795c-ce76-497e-9f0d-51af3e6c3279	-15	55	40	Approval Reaction	2025-06-16 16:59:59.155	780972375394091009	\N	\N	\N	\N
df96a0a3-3e7d-4e35-b8dc-20092050ba61	20	40	60	Daily Gift	2025-06-17 06:00:08.48	780972375394091009	\N	\N	\N	\N
297dc732-0650-4f0d-b3da-cf30d472691d	20	60	80	Daily Gift	2025-06-18 06:00:08.724	780972375394091009	\N	\N	\N	\N
be812b0a-06f4-43a2-a2f6-788cc4988ec6	-30	80	50	New Start Server Poll	2025-06-21 08:12:04.922	780972375394091009	\N	\N	\N	\N
fa783759-e2bc-447a-b13b-efbfa577dbc1	-15	50	35	Approval Reaction	2025-06-21 08:12:08.755	780972375394091009	\N	\N	\N	\N
9d3a1126-72ee-424a-b4c5-758a38598e28	-15	35	20	Approval Reaction	2025-06-21 08:24:56.175	780972375394091009	\N	\N	\N	\N
53197470-61a5-4d86-a783-d6677602751f	15	20	35	Approval Reaction Refund	2025-06-21 08:25:22.821	780972375394091009	\N	\N	\N	\N
99bda7fc-53ff-4be2-8e70-5aee29714295	-15	35	20	Approval Reaction	2025-06-21 08:27:36.375	780972375394091009	\N	\N	\N	\N
1f3ec7c1-2b6a-407c-be48-c7c3c6f44e0b	20	20	40	Daily Gift	2025-06-22 06:00:08.689	780972375394091009	\N	\N	\N	\N
4604bcae-0d31-49e4-afe6-86c7aee203e6	20	40	60	Daily Gift	2025-06-23 06:00:11.139	780972375394091009	\N	\N	\N	\N
0994837c-0307-44d2-a9a1-9ef11da4094a	20	60	80	Daily Gift	2025-06-24 06:00:11.797	780972375394091009	\N	\N	\N	\N
325dae21-d678-46bb-a778-368192a0b436	40	0	40	Set by admin	2025-04-27 09:33:47.423	634021280529645569	\N	\N	\N	\N
a8de0c02-a3f0-47b9-ac2a-0b3f99d4bae9	-40	40	0	Jackpot Payment	2025-04-28 05:38:58.797	634021280529645569	\N	\N	\N	\N
a499d455-af16-40b5-8324-d1c59744d8fc	20	0	20	Daily Gift	2025-04-28 06:00:03.657	634021280529645569	\N	\N	\N	\N
479b568d-a6f0-4007-8148-67ac1abfac49	20	20	40	Daily Gift	2025-04-29 06:00:02.463	634021280529645569	\N	\N	\N	\N
d7a544b1-624e-46a5-934d-1c49e82fc837	20	40	60	Daily Gift	2025-04-30 06:00:03.354	634021280529645569	\N	\N	\N	\N
b7650346-8d3d-449a-a6cb-a16476860c26	20	60	80	Daily Gift	2025-05-01 06:00:03.174	634021280529645569	\N	\N	\N	\N
183ef9c1-0c93-4b10-845b-5ffc96147fb1	20	52	72	Daily Gift	2025-05-06 06:00:02.836	658305794038825030	\N	\N	\N	\N
01947b3c-87e8-499b-aadd-338a5741c669	-3	55	52	Check Credit of Other Users	2025-05-06 05:31:14.912	658305794038825030	\N	\N	\N	\N
bff9710d-21c5-4d97-aa0f-b9372de8dc09	-30	85	55	Jackpot Payment	2025-05-06 02:31:26.929	658305794038825030	\N	\N	\N	\N
e9414e52-6068-4e8e-811e-0bfe050f0b72	-3	88	85	Check Credit of Other Users	2025-05-04 18:12:20.948	658305794038825030	\N	\N	\N	\N
08be94d2-188c-41d2-8232-7ddd41b34171	20	68	88	Daily Gift	2025-05-04 06:00:01.985	658305794038825030	\N	\N	\N	\N
210a1e1a-df89-43f1-a30d-635dac9a8919	-3	71	68	Check Credit of Other Users	2025-05-03 12:44:38.451	658305794038825030	\N	\N	\N	\N
28dda262-9792-4d98-aeb9-4262ea9d0ca3	20	51	71	Daily Gift	2025-05-02 06:00:01.242	658305794038825030	\N	\N	\N	\N
75cce51d-9139-4b50-bba2-d6ebc0ce337d	20	31	51	Daily Gift	2025-05-01 06:00:00.858	658305794038825030	\N	\N	\N	\N
1d52f588-889e-455f-b8f0-9e7f96ecd649	-3	34	31	Check Credit of Other Users	2025-04-30 16:23:31.806	658305794038825030	\N	\N	\N	\N
21359206-14f1-4373-82d0-6c8f370cb710	-3	37	34	Check Credit of Other Users	2025-04-30 16:23:15.183	658305794038825030	\N	\N	\N	\N
b9dfe49d-67d3-4508-922a-10ca4b196ce0	-3	40	37	Check Credit of Other Users	2025-04-30 16:01:42.691	658305794038825030	\N	\N	\N	\N
6634c133-045b-4e10-8e98-5a5292bc292f	20	20	40	Daily Gift	2025-04-30 06:00:00.595	658305794038825030	\N	\N	\N	\N
8c12ffe3-6c3a-4ea8-833b-87056604a053	50	-30	20	Changed by admin	2025-04-30 00:08:51.712	658305794038825030	\N	\N	\N	\N
210eb9cf-7221-42a7-8eba-ba5afe362879	20	-50	-30	Changed by admin	2025-04-30 00:08:35.763	658305794038825030	\N	\N	\N	\N
1033735a-62a1-4ecf-8cb7-6678de150d93	-260	210	-50	Jackpot Payment	2025-04-29 08:44:28.636	658305794038825030	\N	\N	\N	\N
d7910c1d-81c7-4ae7-9168-d1f3f031bc0c	-35	245	210	Jackpot Payment	2025-04-28 05:34:32.339	658305794038825030	\N	\N	\N	\N
8f9ed886-5050-4159-9702-f6a790f253b6	-3	248	245	Check Credit of Other Users	2025-04-28 00:18:43.295	658305794038825030	\N	\N	\N	\N
c9bcf79c-e9c3-492a-a708-050853a11abe	-64	312	248	Transfer Credit	2025-04-27 12:32:10.898	658305794038825030	\N	\N	\N	\N
a0498f2c-5b4e-44b2-90d4-a9f0c1f852cd	-3	315	312	Check Credit of Other Users	2025-04-27 12:31:53.759	658305794038825030	\N	\N	\N	\N
ce2f2009-cc14-49d5-8736-346d3c5e66ab	-15	330	315	Approval Reaction	2025-04-27 11:20:14.871	658305794038825030	\N	\N	\N	\N
b7e11692-fab4-429b-9229-7d4e305be4bc	15	315	330	Approval Reaction Refund	2025-04-27 11:19:48.607	658305794038825030	\N	\N	\N	\N
aade8c67-aa0f-4980-81cd-e783a039a34a	-15	330	315	Approval Reaction	2025-04-27 11:19:40.973	658305794038825030	\N	\N	\N	\N
33b9d0f4-5b69-485d-a9e7-fac86b8b2625	-30	360	330	New Start Server Poll	2025-04-27 11:19:35.168	658305794038825030	\N	\N	\N	\N
22d6428b-b282-4aba-8ed3-d2b47a1c6341	247	113	360	Jackpot Win	2025-04-27 11:16:46.083	658305794038825030	\N	\N	\N	\N
d8003028-ea90-448b-beea-f1482687871c	-60	173	113	Jackpot Payment	2025-04-27 11:16:44.775	658305794038825030	\N	\N	\N	\N
1f4f81a1-fd00-42f3-9933-b9a56375e9b8	-252	425	173	Transfer Credit	2025-04-27 10:53:25.053	658305794038825030	\N	\N	\N	\N
8cfa7c6b-e6ad-42f6-a3b1-8885f8a60266	400	25	425	Changed by admin	2025-04-27 10:53:14.296	658305794038825030	\N	\N	\N	\N
446d73f8-108f-44f0-8305-516772a07617	-35	60	25	Jackpot Payment	2025-04-27 10:16:40.055	658305794038825030	\N	\N	\N	\N
6c506463-fcb8-4924-b687-45b766487b83	190	-130	60	Set by admin	2025-04-27 10:12:05.384	658305794038825030	\N	\N	\N	\N
69a820d1-d101-4b5b-bea7-e5f1803ff369	-60	-70	-130	Jackpot Payment	2025-04-27 10:10:24.585	658305794038825030	\N	\N	\N	\N
82b133cc-bd8e-4c5e-a4b8-89445a533a1c	-110	40	-70	Jackpot Payment	2025-04-27 10:03:51.228	658305794038825030	\N	\N	\N	\N
d5e0198c-4b9c-4a67-8296-1a42ebfed566	40	0	40	Set by admin	2025-04-27 09:33:47.424	658305794038825030	\N	\N	\N	\N
0daddb63-7a32-47b9-8c17-37446004c3b1	-110	72	-38	Jackpot Payment	2025-05-16 10:55:29.478	658305794038825030	\N	\N	\N	\N
9f970dff-2340-4206-a96b-1da75cc98968	20	-38	-18	Daily Gift	2025-05-17 06:00:05.552	658305794038825030	\N	\N	\N	\N
83ae27f5-54c9-4b2f-91e5-ccbf6bbfffd5	20	-18	2	Daily Gift	2025-05-18 06:00:05.742	658305794038825030	\N	\N	\N	\N
22e83863-5f15-4a74-a99a-f1b00f3ba04e	20	2	22	Daily Gift	2025-05-19 06:00:06.046	658305794038825030	\N	\N	\N	\N
8de00952-6494-4dc0-a50e-feff33d7f475	20	22	42	Daily Gift	2025-05-20 06:00:00.317	658305794038825030	\N	\N	\N	\N
9431bd06-0f42-48f0-919b-2b63f57a4c55	20	42	62	Daily Gift	2025-05-21 06:00:00.655	658305794038825030	\N	\N	\N	\N
801628f0-55de-4b0d-923e-2dd5306384e8	20	62	82	Daily Gift	2025-05-22 06:00:01.013	658305794038825030	\N	\N	\N	\N
42c1ee2e-2095-42f5-8632-03e09b01c453	-3	82	79	Refresh DNS Record	2025-06-16 17:02:52.712	658305794038825030	\N	\N	\N	\N
b356427b-1932-4189-ac96-59477560c7c2	-3	79	76	Check Permission Of Other Users	2025-06-16 17:07:27.736	658305794038825030	\N	\N	\N	\N
237245b8-a5a3-4b55-b4e4-218536873716	-3	76	73	Check Permission Of Other Users	2025-06-16 17:08:03.106	658305794038825030	\N	\N	\N	\N
601e3e28-5f75-4d26-9a69-785eb334b3fa	-15	73	58	Approval Reaction	2025-06-21 08:12:25.119	658305794038825030	\N	\N	\N	\N
76890726-f419-49ac-a5be-763f0a69abc8	-3	58	55	Refresh DNS Record	2025-06-21 08:19:22.242	658305794038825030	\N	\N	\N	\N
fd1c882f-c463-4350-9d2a-2ec70c64362d	-30	55	25	New Start Server Poll	2025-06-21 08:24:45.874	658305794038825030	\N	\N	\N	\N
55ab6553-225d-4fbd-a766-5bfa1010b8e0	-3	25	22	Check Credit of Other Users	2025-06-21 08:26:53.926	658305794038825030	\N	\N	\N	\N
15f46380-c51c-4893-9345-a4a29c8eb7b3	20	22	42	Daily Gift	2025-06-22 06:00:07.999	658305794038825030	\N	\N	\N	\N
65414f8e-6f28-4447-a664-422e43a21fc8	20	42	62	Daily Gift	2025-06-23 06:00:10.525	658305794038825030	\N	\N	\N	\N
bbb85926-30ca-43da-8786-cd19a543ef77	20	62	82	Daily Gift	2025-06-24 06:00:10.927	658305794038825030	\N	\N	\N	\N
842bcab3-e462-46ef-ad0a-b2de33c2dbe2	-20	82	62	New Run Command Poll	2025-06-28 05:31:20.501	658305794038825030	\N	\N	\N	\N
eb331085-0d83-4be2-bd36-8ae796823b7b	-20	62	42	Approval Reaction	2025-06-28 05:31:44.353	658305794038825030	\N	\N	\N	\N
5c60a3fe-337b-4432-aae1-2a390f43912b	-20	42	22	Approval Reaction	2025-06-28 05:31:47.832	658305794038825030	\N	\N	\N	\N
6c67862c-435c-4048-a50d-8ccd02a947a4	20	22	42	Daily Gift	2025-06-28 06:00:11.831	658305794038825030	\N	\N	\N	\N
23651eae-e517-4ce9-9da9-076d0e0adcb4	20	42	62	Daily Gift	2025-06-29 06:00:12.116	658305794038825030	\N	\N	\N	\N
88cacd06-a10d-42fa-82ae-c97a6bcab2fc	20	62	82	Daily Gift	2025-06-30 06:00:12.299	658305794038825030	\N	\N	\N	\N
4b536f4e-b6d7-4a72-9fe7-0fdc93dbe1c0	-30	82	52	New Stop Server Poll	2025-09-23 09:07:32.164	658305794038825030	\N	\N	\N	\N
69673061-41cb-4369-a39a-b2232e47292c	-15	52	37	Approval Reaction	2025-09-23 09:07:37.89	658305794038825030	\N	\N	\N	\N
505dd172-b29c-4da6-9e88-9cb9a32a7e4c	-30	37	7	New Start Server Poll	2025-09-23 10:37:52.663	658305794038825030	\N	\N	\N	\N
717683f6-64b7-4c3b-b0c2-6b082b0b756c	-15	7	-8	Approval Reaction	2025-09-23 10:37:57.018	658305794038825030	\N	\N	\N	\N
e1f5cf45-5cc6-42ba-8549-caff5da4a5ff	-30	-8	-38	New Start Server Poll	2025-09-23 10:50:30.775	658305794038825030	\N	\N	\N	\N
b7c9942e-a3d7-4142-ba9c-fec88d4bc93a	-15	-38	-53	Approval Reaction	2025-09-23 10:50:38.809	658305794038825030	\N	\N	\N	\N
592c5e9d-6431-4fa3-bd77-abbd7b112ddf	50	-53	-3	Changed by admin	2025-09-23 12:15:21.499	658305794038825030	\N	\N	\N	\N
f518b8a1-781a-4e8a-a691-9b22cc427ad6	-3	-3	-6	Check Permission Of Other Users	2025-09-23 12:19:49.266	658305794038825030	\N	\N	\N	\N
101be7ab-efa4-40a0-b377-9426fe39f919	60	-6	54	Changed by admin	2025-09-23 12:22:05.793	658305794038825030	\N	\N	\N	\N
d2a47b33-add9-49a9-a50c-5aeab6960d7c	-3	54	51	Check Credit of Other Users	2025-09-23 12:35:57.669	658305794038825030	\N	\N	\N	\N
c4ca7856-b25d-45a5-9d73-1d1156b46b39	-70	51	-19	Upload Custom Mod to Server	2025-09-23 14:09:10.118	658305794038825030	\N	\N	\N	\N
31c84f10-3fee-4a77-95ec-be399375bb69	-70	-19	-89	Upload Custom Mod to Server	2025-09-23 14:13:49.149	658305794038825030	\N	\N	\N	\N
49a0cf13-97f8-496f-9cc4-86f8bbdfa1ff	-70	290	220	Upload Custom Mod to Server	2025-09-23 14:22:04.059	678185861275189258	\N	\N	\N	\N
7b43be51-e95a-47f7-99b4-2ec6abf6fe0e	-70	-89	-159	Upload Custom Mod to Server	2025-09-23 14:26:22.518	658305794038825030	\N	\N	\N	\N
4a03a872-7e63-45d9-adb0-42cd62e860fe	-70	-159	-229	Upload Custom Mod to Server	2025-09-23 14:31:12.511	658305794038825030	\N	\N	\N	\N
f4fbe294-d94d-441a-8932-624f4d8022c4	-70	-229	-299	Upload Custom Mod to Server	2025-09-23 15:38:41.595	658305794038825030	\N	\N	\N	\N
139bafeb-ff55-4c50-b31c-75b7a8765cd4	-70	220	150	Upload Custom Mod to Server	2025-09-23 15:39:33.276	678185861275189258	\N	\N	\N	\N
ccb2b719-a8fd-4c82-ab61-fcdee64008ee	-70	150	80	Upload Custom Mod to Server	2025-09-23 15:41:51.06	678185861275189258	\N	\N	\N	\N
62336854-5bea-4c92-b732-ead93b4ca205	-70	80	10	Upload Custom Mod to Server	2025-09-23 15:47:55.089	678185861275189258	\N	\N	\N	\N
7d7e5e68-5797-4b20-8542-43d7479aad39	-70	-299	-369	Upload Custom Mod to Server	2025-09-23 15:55:51.412	658305794038825030	\N	\N	\N	\N
2f963f06-4900-4f01-a543-50bbca7964b2	70	-369	-299	Refund for cancelled upload mod to server	2025-09-23 15:55:55.534	658305794038825030	\N	\N	\N	\N
526801d2-de0a-4eb0-bb98-4fcc4cad2893	-70	-299	-369	Upload Custom Mod to Server	2025-09-23 15:56:46.877	658305794038825030	\N	\N	\N	\N
cb696412-3442-4763-864c-a242b0c7dd0f	-70	-369	-439	Upload Custom Mod to Server	2025-09-23 15:58:49.617	658305794038825030	\N	\N	\N	\N
2bc216e1-a4ea-49ac-a266-6135d125235a	70	-439	-369	Refund for cancelled upload mod to server	2025-09-23 15:58:57.245	658305794038825030	\N	\N	\N	\N
3b85a6da-0eef-451e-b15a-1f7ef55290ad	-70	-369	-439	Upload Custom Mod to Server	2025-09-23 15:59:31.087	658305794038825030	\N	\N	\N	\N
c4ba4f48-0fae-40f6-bcbd-d0d58529bc95	70	-439	-369	Refund for cancelled upload mod to server	2025-09-23 15:59:38.567	658305794038825030	\N	\N	\N	\N
9f6494a4-3822-4521-9534-13e4659c2f3e	-70	-369	-439	Upload Custom Mod to Server	2025-09-23 16:00:38.83	658305794038825030	\N	\N	\N	\N
21c7abfb-de43-4ad8-92b9-750c69e5275e	-70	-439	-509	Upload Custom Mod to Server	2025-09-23 16:01:17.328	658305794038825030	\N	\N	\N	\N
e38ea431-701d-476e-8f7f-a28cdb0870b5	-70	-509	-579	Upload Custom Mod to Server	2025-09-23 16:02:19.692	658305794038825030	\N	\N	\N	\N
196446f3-e7c1-41a7-85fd-7b5f0791772f	-70	-579	-649	Upload Custom Mod to Server	2025-09-23 16:03:06.292	658305794038825030	\N	\N	\N	\N
32d4f2ca-8824-4683-b4ed-e3c30601f6ee	-70	10	-60	Upload Custom Mod to Server	2025-09-23 16:07:43.931	678185861275189258	\N	\N	\N	\N
fef4c667-3779-42a8-a2ad-457c590ac7d5	-70	-649	-719	Upload Custom Mod to Server	2025-09-23 16:29:19.119	658305794038825030	\N	\N	\N	\N
a1dd5501-3492-4eb0-b6a2-9e241a6dc45e	500	-60	440	Changed by admin	2025-09-23 16:40:04.378	678185861275189258	\N	\N	\N	\N
97ef97fc-e625-4354-a908-551336f0af90	1019	-719	300	Set by admin	2025-09-23 16:40:13.585	658305794038825030	\N	\N	\N	\N
354c7d2f-dfce-4938-9db8-7357cbb137d9	1019	-719	300	Set by admin	2025-09-23 16:42:02.992	658305794038825030	\N	\N	\N	\N
911d7e5e-9cce-4cbd-8aab-f93afe3a525b	200	300	500	Set by admin	2025-09-23 16:43:07.566	658305794038825030	\N	\N	\N	\N
ba05da64-9593-4f3f-af83-e804dd7c00a9	-70	500	430	Upload Custom Mod to Server	2025-09-23 16:47:55.504	658305794038825030	\N	\N	\N	\N
5effef69-8d15-432d-9518-0ed0067fac04	70	430	500	Refund for cancelled Upload Custom Mod to Server	2025-09-23 16:48:02.118	658305794038825030	\N	\N	\N	\N
2bcbaa16-bbb2-453f-a5ab-7d9f3b564260	-3	500	497	Check Permission Of Other Users	2025-09-23 16:49:47.094	658305794038825030	\N	\N	\N	\N
56aeab94-5d95-46d7-b1af-0aec33fcef95	-70	497	427	Upload Custom Mod to Server	2025-09-23 16:55:52.017	658305794038825030	\N	\N	\N	\N
b69ac7f3-d23c-4721-94f2-c836d7d77386	70	427	497	Refund for cancelled Upload Custom Mod to Server	2025-09-23 16:56:18.618	658305794038825030	\N	\N	\N	\N
27c1d99f-65d4-4b1d-bbfe-ba70166b6935	-70	497	427	Upload Custom Mod to Server	2025-09-24 06:14:04.265	658305794038825030	\N	\N	\N	\N
945b717a-3552-4929-8842-bef60fa130f3	-70	427	357	Upload Custom Mod to Server	2025-09-24 06:18:27.619	658305794038825030	\N	\N	\N	\N
9fe8a1ca-e37b-4af2-ba28-a7eb3ef4ac3a	-70	357	287	Upload Custom Mod to Server	2025-09-24 06:20:34.423	658305794038825030	\N	\N	\N	\N
47ce9dbc-899c-438f-b37e-fb3c1fcdb7bd	-70	287	217	Upload Custom Mod to Server	2025-09-24 06:24:54.782	658305794038825030	\N	\N	\N	\N
52ba3523-9f9c-44c8-9f49-08c6a78b8802	-70	217	147	Upload Custom Mod to Server	2025-09-24 06:26:38.199	658305794038825030	\N	\N	\N	\N
9ba60e7a-da6f-4341-b4de-ad6fe4428d8a	-70	147	77	Upload Custom Mod to Server	2025-09-24 06:28:20.246	658305794038825030	\N	\N	\N	\N
279b4930-e6e6-4deb-ac84-43b2b3a2a6ae	70	77	147	Refund for cancelled Upload Custom Mod to Server	2025-09-24 06:28:26.41	658305794038825030	\N	\N	\N	\N
8335c8ba-cb6a-4c72-8acd-3bdbe1090d0b	-70	147	77	Upload Custom Mod to Server	2025-09-24 06:37:58.749	658305794038825030	\N	\N	\N	\N
7e39e722-7af1-4dbb-ad16-f1a2eee4e7c0	-70	440	370	Upload Custom Mod to Server	2025-09-24 06:39:10.017	678185861275189258	\N	\N	\N	\N
f08cfb50-22f2-4924-a26d-a6b0d9d24a2a	-70	77	7	Upload Custom Mod to Server	2025-09-24 06:43:43.238	658305794038825030	\N	\N	\N	\N
25ebbeb4-e433-41b0-93c9-171bb1341ba2	70	7	77	Refund for cancelled Upload Custom Mod to Server	2025-09-24 06:46:10.02	658305794038825030	\N	\N	\N	\N
8c0a5a9b-7eaf-412c-ae0d-120ede97923d	-70	77	7	Upload Custom Mod to Server	2025-09-24 06:52:02.526	658305794038825030	\N	\N	\N	\N
c4ba6868-29aa-4ecb-899d-c419060d4bd9	-70	7	-63	Upload Custom Mod to Server	2025-09-24 06:54:24.75	658305794038825030	\N	\N	\N	\N
4fe0f0bf-fe1b-468a-9d58-8d03e66799cd	-70	-63	-133	Upload Custom Mod to Server	2025-09-24 06:56:39.703	658305794038825030	\N	\N	\N	\N
8116e350-4a7e-4b52-9045-3c3d7ef5f771	70	-133	-63	Refund for cancelled Upload Custom Mod to Server	2025-09-24 06:58:49.899	658305794038825030	\N	\N	\N	\N
daabebf8-7b9d-45e1-a2f6-0510e227be47	-70	-63	-133	Upload Custom Mod to Server	2025-09-24 06:59:01.386	658305794038825030	\N	\N	\N	\N
f805d4fd-49ad-41fb-8cc8-d95aa71bc263	-70	-133	-203	Upload Custom Mod to Server	2025-09-24 06:59:45.156	658305794038825030	\N	\N	\N	\N
80bc41e9-0440-4eda-96d4-8fa2427e95aa	253	-203	50	Set by admin	2025-09-24 07:00:21.767	658305794038825030	\N	\N	\N	\N
c075de6c-4fa5-44cc-8678-d4b40415ab09	-30	531	501	New Start Server Poll	2025-09-24 09:27:27.418	844193954756689921	\N	\N	\N	\N
8188a729-da9d-4777-9012-7975506ff2be	-15	80	65	Approval Reaction	2025-09-24 09:27:46.007	645919565758464010	\N	\N	\N	\N
018852ba-56b8-4b8f-9afc-484268dc28bf	-15	50	35	Approval Reaction	2025-09-24 09:27:53.909	658305794038825030	\N	\N	\N	\N
75b7f0f3-7db3-4589-a103-0ee5ac519395	-15	501	486	Approval Reaction	2025-09-24 09:28:06.138	844193954756689921	\N	\N	\N	\N
da1d294b-1dc4-42bf-a014-60c9ae5732cd	-15	80	65	Approval Reaction	2025-09-24 09:28:16.375	780972375394091009	\N	\N	\N	\N
c4622765-b864-491e-adfd-fb9726a7d091	-20	35	15	New Run Command Poll	2025-09-24 11:50:01.466	658305794038825030	\N	\N	\N	\N
c38251d1-4865-43de-8e45-7856f7185656	-20	15	-5	Approval Reaction	2025-09-24 11:50:07.115	658305794038825030	\N	\N	\N	\N
59c4d9d9-62e3-4319-b1d8-060aa10b4a68	-20	-5	-25	New Run Command Poll	2025-09-24 11:50:15.666	658305794038825030	\N	\N	\N	\N
acd69e64-b9c9-4cec-a525-3abc9e24f138	-20	-25	-45	Approval Reaction	2025-09-24 11:50:19.823	658305794038825030	\N	\N	\N	\N
857b762f-b7fe-4e2c-97f1-47437eb28bde	-20	-45	-65	Approval Reaction	2025-09-24 11:50:39.395	658305794038825030	\N	\N	\N	\N
b5a5c28a-bb80-4550-bca8-ac779dfeecec	-20	-65	-85	Approval Reaction	2025-09-24 11:50:40.849	658305794038825030	\N	\N	\N	\N
299d673e-9273-4cb5-85cb-9893eca6e469	-20	-85	-105	Approval Reaction	2025-09-24 11:50:55.662	658305794038825030	\N	\N	\N	\N
8162d124-4bff-449f-a635-7efcd1a653a1	-3	-105	-108	Check Credit of Other Users	2025-09-24 11:52:09.802	658305794038825030	\N	\N	\N	\N
ed306db9-fa8f-4e41-bf48-5104a7e8ba02	-3	-108	-111	Check Credit of Other Users	2025-09-24 11:52:32.876	658305794038825030	\N	\N	\N	\N
1a9ede87-35e6-421d-94e7-ccf8ce96b1a4	-70	-111	-181	Upload Custom Mod to Server	2025-09-25 04:34:42.043	658305794038825030	\N	\N	\N	\N
f943c221-6587-46f5-9138-ba893a53c134	70	-181	-111	Refund for cancelled Upload Custom Mod to Server	2025-09-25 04:35:34.3	658305794038825030	\N	\N	\N	\N
21f53d26-0d83-4545-81d1-7b2985694fc5	-30	-111	-141	New Start Server Poll	2025-09-25 05:02:09.773	658305794038825030	\N	\N	\N	\N
fa9ec12e-4501-46d1-b729-9ac69aa9d771	-15	-141	-156	Approval Reaction	2025-09-25 05:02:19.704	658305794038825030	\N	\N	\N	\N
3b0fd3ff-0cc8-4469-8489-ee3b047b6d33	-15	80	65	Approval Reaction	2025-09-25 05:02:51.018	634021280529645569	\N	\N	\N	\N
c9bfef1c-b3a9-4c4f-8610-6c4140e2307f	-15	75	60	Approval Reaction	2025-09-25 05:03:04.271	804333943775559680	\N	\N	\N	\N
ce310f54-ea70-4562-ae8a-feecf5a7ac46	206	-156	50	Set by admin	2025-09-25 05:21:54.432	658305794038825030	\N	\N	\N	\N
a74e98d9-dbe9-4dd2-af32-a4f8aa073c84	20	65	85	Daily Gift	2025-09-25 06:00:00.454	645919565758464010	\N	\N	\N	\N
90490a6d-888f-496b-88ed-3d16d0fee949	20	65	85	Daily Gift	2025-09-25 06:00:00.998	780972375394091009	\N	\N	\N	\N
30ae590a-daf6-4be1-82f0-20ed19712bf9	20	65	85	Daily Gift	2025-09-25 06:00:01.737	634021280529645569	\N	\N	\N	\N
7dccd32f-c0f3-47c3-9075-2eab9799a9fa	20	60	80	Daily Gift	2025-09-25 06:00:02.374	804333943775559680	\N	\N	\N	\N
f4c92906-12ee-4405-8a76-b283fecc020e	20	50	70	Daily Gift	2025-09-25 06:00:03.086	658305794038825030	\N	\N	\N	\N
9d5008c4-8742-4582-afca-63ccb67afda5	-3	70	67	Check Credit of Other Users	2025-09-25 09:16:07.645	658305794038825030	\N	\N	\N	\N
f7003e6a-0a39-46d1-b46b-ceb29424ba1e	-76	67	-9	Transfer Credit	2025-09-25 09:30:50.689	658305794038825030	\N	\N	\N	\N
f2f9607e-3b5f-444d-98d3-6bed4f194e08	40	370	410	Received Transfer Credit	2025-09-25 09:30:50.7	678185861275189258	\N	\N	\N	\N
09bef627-abfd-4c8e-9dfb-c3bbe1b46423	40	410	450	Cancelled: Received Transfer Credit	2025-09-25 09:31:42.71	678185861275189258	\N	\N	\N	\N
3e7418f6-b493-4058-9cb6-e1b2f5bef874	-40	-9	-49	Transfer Credit Refund	2025-09-25 09:31:42.71	658305794038825030	\N	\N	\N	\N
84f42cd7-f196-45f1-93dd-37a00dbb9742	99	-49	50	Set by admin	2025-09-25 09:32:07.791	658305794038825030	\N	\N	\N	\N
d4a2c048-e753-4a2f-960c-ab79bb841728	-64	50	-14	Transfer Credit	2025-09-25 09:32:27.712	658305794038825030	\N	\N	\N	\N
28c87061-9a51-4442-8b21-1b6f040d4ec9	20	450	470	Received Transfer Credit	2025-09-25 09:32:27.716	678185861275189258	\N	\N	\N	\N
24dd23d4-fb56-4182-a032-f66e6a8e3e63	20	470	490	Cancelled: Received Transfer Credit	2025-09-25 09:32:59.393	678185861275189258	\N	\N	\N	\N
b24eb32b-35e2-4aa2-82cc-b145626e4a97	-20	-14	-34	Transfer Credit Refund	2025-09-25 09:32:59.393	658305794038825030	\N	\N	\N	\N
ea6eb2cf-2683-4a5a-b02d-6acde9b85a0a	-62	-34	-96	Transfer Credit	2025-09-25 09:33:59.956	658305794038825030	\N	\N	\N	\N
cb183b83-8ed3-481d-a0f6-7dac546ff068	5	490	495	Received Transfer Credit	2025-09-25 09:33:59.968	678185861275189258	\N	\N	\N	\N
a6fdf952-a20f-4919-961a-a69fe752e330	-5	-96	-101	Transfer Credit Refund	2025-09-25 09:34:13.343	658305794038825030	\N	\N	\N	\N
f5f1c67a-e434-418a-b772-f953a3c69344	5	495	500	Cancelled: Received Transfer Credit	2025-09-25 09:34:13.343	678185861275189258	\N	\N	\N	\N
b1c0da75-0636-44b0-999d-f979705c414e	-117	-101	-218	Transfer Credit	2025-09-25 09:42:41.203	658305794038825030	\N	\N	\N	\N
83ed99d6-c161-4cb9-a7bf-c547c7ba8669	50	500	550	Received Transfer Credit	2025-09-25 09:42:41.223	678185861275189258	\N	\N	\N	\N
41400b46-274e-4057-95fe-c076c93ad8b1	-133	-218	-351	Transfer Credit	2025-09-25 09:44:47.866	658305794038825030	\N	\N	\N	\N
24fcf1e4-fd5b-479c-a406-3e47880d2378	50	550	600	Received Transfer Credit	2025-09-25 09:44:47.885	678185861275189258	\N	\N	\N	\N
9df512b8-0925-467e-80db-e1fab64e4143	-309	600	291	Transfer Credit	2025-09-25 09:45:16.723	678185861275189258	\N	\N	\N	\N
f03abc0e-5ca3-49c6-a4cc-8a1c03968d88	200	-351	-151	Received Transfer Credit	2025-09-25 09:45:16.731	658305794038825030	\N	\N	\N	\N
333be899-0cda-4291-9026-cea6140c84dd	-678	-151	-829	Transfer Credit	2025-09-25 09:46:34.68	658305794038825030	\N	\N	\N	\N
8c41d9a4-aaab-42ec-8f53-597f4f93d2ec	600	291	891	Received Transfer Credit	2025-09-25 09:46:34.695	678185861275189258	\N	\N	\N	\N
9f245b90-7720-4c15-b227-76b855cf9e4f	600	891	1491	Cancelled: Received Transfer Credit	2025-09-25 09:46:47.307	678185861275189258	\N	\N	\N	\N
2d7a4dbc-962e-4296-be5f-b3e27c657446	-600	-829	-1429	Transfer Credit Refund	2025-09-25 09:46:47.307	658305794038825030	\N	\N	\N	\N
d09370ea-d2b9-488d-95c3-2a3607adab20	1509	-1429	80	Set by admin	2025-09-25 09:47:25.85	658305794038825030	\N	\N	\N	\N
6fce5192-dd8c-4245-a29b-488a1207d2db	-750	80	-670	Transfer Credit	2025-09-25 09:48:27.305	658305794038825030	\N	\N	\N	\N
d5989890-4ae4-4b47-bb27-ebb7934772a9	600	1491	2091	Received Transfer Credit	2025-09-25 09:48:27.315	678185861275189258	\N	\N	\N	\N
a9f1389a-2132-40c5-934a-eb509a4443ea	-600	2091	1491	Cancelled: Received Transfer Credit	2025-09-25 09:48:36.138	678185861275189258	\N	\N	\N	\N
e2c1a033-a393-4b5b-9891-819806555371	-600	-670	-1270	Transfer Credit Refund	2025-09-25 09:48:36.137	658305794038825030	\N	\N	\N	\N
5e67a830-3452-45ed-88f1-529671c1de5b	-750	-1270	-2020	Transfer Credit	2025-09-25 09:49:36.975	658305794038825030	\N	\N	\N	\N
b42e0fa8-6499-42f7-96e3-8d36518ddaf6	600	1491	2091	Received Transfer Credit	2025-09-25 09:49:36.985	678185861275189258	\N	\N	\N	\N
1de53e08-3ec0-4110-ae44-9982a3d586e6	-600	2091	1491	Cancelled: Received Transfer Credit	2025-09-25 09:49:42.312	678185861275189258	\N	\N	\N	\N
d6cfb15e-48dc-4f20-9348-a3bfc6a81de4	600	-2020	-1420	Transfer Credit Refund	2025-09-25 09:49:42.311	658305794038825030	\N	\N	\N	\N
935af8b9-e290-4f28-9c28-7c17dc25a7a5	-30	-1420	-1450	New Start Server Poll	2025-09-25 13:55:14.81	658305794038825030	\N	\N	\N	\N
6e2cea40-f87d-431f-980a-a1c621565e2a	-30	-1450	-1480	New Start Server Poll	2025-09-25 14:04:02.499	658305794038825030	\N	\N	\N	\N
d412f380-4799-4b09-a65f-2ebb4282295c	30	-1480	-1450	New Approval Poll Refund	2025-09-25 14:04:56.12	658305794038825030	\N	\N	\N	\N
e220b884-949a-441b-8ad0-2fb0734cff3c	30	-1450	-1420	New Approval Poll Refund	2025-09-25 14:04:57.188	658305794038825030	\N	\N	\N	\N
ddea73d2-3d2b-4982-b6f7-f8980ba79e44	30	-1420	-1390	New Approval Poll Refund	2025-09-25 14:04:57.229	658305794038825030	\N	\N	\N	\N
79f48f5a-6f62-4c2a-aa6a-04aa0cb02061	30	-1390	-1360	New Approval Poll Refund	2025-09-25 14:04:58.823	658305794038825030	\N	\N	\N	\N
8b91e969-9e41-4cbd-9d20-dc58328a8eb3	30	-1360	-1330	New Approval Poll Refund	2025-09-25 14:04:59.114	658305794038825030	\N	\N	\N	\N
94c107e5-f05f-4d44-8c7c-770aed0cecad	-30	-1330	-1360	New Start Server Poll	2025-09-25 14:05:09.827	658305794038825030	\N	\N	\N	\N
8dfb2907-1629-490f-a2f6-7f74c7e22b26	-15	-1360	-1375	Approval Reaction	2025-09-25 14:05:18.677	658305794038825030	\N	\N	\N	\N
8f87c912-a6f6-4485-923a-98e0ed54ce6d	-30	-1375	-1405	New Stop Server Poll	2025-09-25 14:05:38.395	658305794038825030	\N	\N	\N	\N
325b3c32-1173-45a3-8405-d99af05bfb0e	-15	-1405	-1420	Approval Reaction	2025-09-25 14:05:45.544	658305794038825030	\N	\N	\N	\N
1125c784-462e-4f6d-8ebf-0160113ef80e	-30	-1420	-1450	New Start Server Poll	2025-09-25 14:06:54.657	658305794038825030	\N	\N	\N	\N
2cef112f-cb49-4688-b938-7d83db562e88	30	-1450	-1420	New Approval Poll Refund	2025-09-25 14:08:06.221	658305794038825030	\N	\N	\N	\N
66b75fff-dde8-447d-9b9d-99b0e8dbf21b	-30	-1420	-1450	New Start Server Poll	2025-09-25 14:08:17.611	658305794038825030	\N	\N	\N	\N
36de9839-9003-4e39-97ad-741a1e56ac33	-15	-1450	-1465	Approval Reaction	2025-09-25 14:08:24.597	658305794038825030	\N	\N	\N	\N
92baa69b-4f55-469d-973b-5a325af50ad7	30	-1465	-1435	New Approval Poll Refund	2025-09-25 14:11:38.475	658305794038825030	\N	\N	\N	\N
f63c946a-993d-418e-8f63-c962249581e0	15	-1435	-1420	Approval Reaction Refund	2025-09-25 14:11:38.973	658305794038825030	\N	\N	\N	\N
91191912-e2d5-4fc8-bf07-e39da62d5722	-30	-1420	-1450	New Start Server Poll	2025-09-25 14:11:47.094	658305794038825030	\N	\N	\N	\N
652417dc-a95f-43ce-9a0c-68a20eccba0e	-15	-1450	-1465	Approval Reaction	2025-09-25 14:11:53.365	658305794038825030	\N	\N	\N	\N
e4402083-4a43-4a98-95ea-6be32e5f8aa3	-15	-1465	-1480	Approval Reaction	2025-09-25 14:12:01.632	658305794038825030	\N	\N	\N	\N
3374cd8c-1c92-4ce6-ac61-e0677f6f7ff5	-15	-1480	-1495	Approval Reaction	2025-09-25 14:12:13.445	658305794038825030	\N	\N	\N	\N
91ab1162-5ed0-40ea-bb9d-0707701c7bf1	30	-1495	-1465	New Approval Poll Refund	2025-09-25 14:15:59.413	658305794038825030	\N	\N	\N	\N
6323d302-a241-49af-b3aa-f05009195f88	15	-1465	-1450	Approval Reaction Refund	2025-09-25 14:15:59.879	658305794038825030	\N	\N	\N	\N
fc4ae44f-0b32-400c-9dc9-7a3f74f90e27	15	-1450	-1435	Approval Reaction Refund	2025-09-25 14:16:00.317	658305794038825030	\N	\N	\N	\N
c6e481a5-1800-4391-95ca-5273757c69b1	15	-1435	-1420	Approval Reaction Refund	2025-09-25 14:16:00.67	658305794038825030	\N	\N	\N	\N
d77f981c-4f2e-4786-b6cf-220ee30ca070	-30	-1420	-1450	New Start Server Poll	2025-09-25 14:16:08.698	658305794038825030	\N	\N	\N	\N
2e167da6-e15b-4832-8e30-a77a20bbb589	30	-1450	-1420	New Approval Poll Refund	2025-09-25 14:17:03.191	658305794038825030	\N	\N	\N	\N
ff14b94a-af70-4b0d-96bd-0b1f98f36700	-30	-1420	-1450	New Start Server Poll	2025-09-25 14:17:09.175	658305794038825030	\N	\N	\N	\N
999229c4-d915-461e-9064-047ae6e80bac	30	-1450	-1420	New Approval Poll Refund	2025-09-25 14:17:54.263	658305794038825030	\N	\N	\N	\N
6353059f-002a-493d-a672-98796da7cc40	-30	-1420	-1450	New Start Server Poll	2025-09-25 14:17:59.645	658305794038825030	\N	\N	\N	\N
461e9934-f0b7-482e-80d1-3e55648d694c	-15	-1450	-1465	Approval Reaction	2025-09-25 14:19:37.904	658305794038825030	\N	\N	\N	\N
a9f5be34-0899-418d-b4b8-148faca90022	-15	1491	1476	Approval Reaction	2025-09-25 14:19:41.614	678185861275189258	\N	\N	\N	\N
c88e7f97-8be8-409e-855f-eb14cb2504a9	30	-1465	-1435	New Approval Poll Refund	2025-09-25 14:21:44.989	658305794038825030	\N	\N	\N	\N
6b8a396d-7c2f-47d0-81db-93034b86da1c	15	-1435	-1420	Approval Reaction Refund	2025-09-25 14:21:45.371	658305794038825030	\N	\N	\N	\N
3c117f40-dac8-4cea-a9fe-803736aaafdb	15	1476	1491	Approval Reaction Refund	2025-09-25 14:21:45.713	678185861275189258	\N	\N	\N	\N
f9bc2759-ced0-42af-a4c1-29d6638a4dd1	-30	-1420	-1450	New Start Server Poll	2025-09-25 14:21:53.405	658305794038825030	\N	\N	\N	\N
e9d8812e-cd05-4484-9b21-fe6f9fb43b1c	-15	-1450	-1465	Approval Reaction	2025-09-25 14:22:00.284	658305794038825030	\N	\N	\N	\N
8986ff3f-37eb-414c-a3e8-395465975c86	30	-1465	-1435	New Approval Poll Refund	2025-09-25 14:22:17.161	658305794038825030	\N	\N	\N	\N
8effe98c-b2c4-45c9-828a-f053e950406a	15	-1435	-1420	Approval Reaction Refund	2025-09-25 14:22:17.504	658305794038825030	\N	\N	\N	\N
6650cf68-41b4-4810-b242-829fe708cd07	-30	-1420	-1450	New Start Server Poll	2025-09-25 14:22:24.962	658305794038825030	\N	\N	\N	\N
0f530a61-ec3c-4dfd-b0e0-3c45ae0847a3	-15	-1450	-1465	Approval Reaction	2025-09-25 14:22:31.699	658305794038825030	\N	\N	\N	\N
f5f06f00-09ca-4571-8cd2-2220012d0707	30	-1465	-1435	New Approval Poll Refund	2025-09-25 14:25:01.799	658305794038825030	\N	\N	\N	\N
8c1294cf-ed9d-41b3-9d35-074e33095b5a	15	-1435	-1420	Approval Reaction Refund	2025-09-25 14:25:02.193	658305794038825030	\N	\N	\N	\N
a0e6591d-0384-4bde-a05c-7493bbe5e3d5	-30	-1420	-1450	New Start Server Poll	2025-09-25 14:25:09.706	658305794038825030	\N	\N	\N	\N
c9a0f978-395f-4a80-bd41-fe2097338558	-15	-1450	-1465	Approval Reaction	2025-09-25 14:25:15.43	658305794038825030	\N	\N	\N	\N
1cfefc4c-21e6-4934-952e-e15a87e34f8b	-30	-1465	-1495	New Stop Server Poll	2025-09-25 14:25:44.255	658305794038825030	\N	\N	\N	\N
f89995c7-2772-421f-8d26-8cc312568474	-15	-1495	-1510	Approval Reaction	2025-09-25 14:25:52.492	658305794038825030	\N	\N	\N	\N
5ff8d120-ae14-4f04-8844-bb04752dfce4	-15	-1510	-1525	Approval Reaction	2025-09-25 14:25:59.285	658305794038825030	\N	\N	\N	\N
8fd0feac-5ebe-4bc0-9893-147f77533e54	20	-1525	-1505	Daily Gift	2025-09-26 06:00:00.441	658305794038825030	\N	\N	\N	\N
5e000e91-18fb-46be-90a6-d3a12eb3db3b	1555	-1505	50	Set by admin	2025-09-26 09:23:01.192	658305794038825030	\N	\N	\N	\N
e106511e-003e-4752-afb9-213167d2b3ed	-30	85	55	New Start Server Poll	2025-09-26 13:40:49.536	645919565758464010	\N	\N	\N	\N
75aa58c7-06d9-4e49-a9c4-89828d3267ac	-15	55	40	Approval Reaction	2025-09-26 13:40:52.225	645919565758464010	\N	\N	\N	\N
b788ceef-975c-4c3f-a0d1-636770c4a664	-15	486	471	Approval Reaction	2025-09-26 13:40:54.998	844193954756689921	\N	\N	\N	\N
b1b82ee5-d73b-40c5-aa8e-b3ccd18161be	-15	85	70	Approval Reaction	2025-09-26 13:40:57.144	780972375394091009	\N	\N	\N	\N
b09a0d19-6f1d-466c-80c8-a6aced68b965	20	50	70	Daily Gift	2025-09-27 06:00:00.483	658305794038825030	\N	\N	\N	\N
d14acf44-fc42-4a22-a0e4-eac7710c8523	20	40	60	Daily Gift	2025-09-27 06:00:01.398	645919565758464010	\N	\N	\N	\N
0c1237ba-88f6-4a3b-b669-2c0281e74d03	20	70	90	Daily Gift	2025-09-27 06:00:02.198	780972375394091009	\N	\N	\N	\N
4ba2aa48-12d1-4687-9542-221b8799554b	-3	70	67	Check Permission Of Other Users	2025-09-27 16:47:36.625	658305794038825030	\N	\N	\N	\N
ec067d21-dadd-4dd8-920d-5a6a7016548d	-3	67	64	Check Permission Of Other Users	2025-09-27 16:47:46.578	658305794038825030	\N	\N	\N	\N
a5c18ea8-0736-47c9-bae3-42ef262ed977	-30	1491	1461	New Start Server Poll	2025-09-27 17:01:55.674	678185861275189258	\N	\N	\N	\N
a398637f-dbff-4f16-be26-3b1bdd14de9f	-15	64	49	Approval Reaction	2025-09-27 17:02:10.722	658305794038825030	\N	\N	\N	\N
b7d43b61-baa4-4e42-a30c-79cec2ca8e2d	20	60	80	Daily Gift	2025-09-28 06:00:00.285	645919565758464010	\N	\N	\N	\N
bb514c1c-eb0c-4c5a-802a-56e14a8cad44	20	49	69	Daily Gift	2025-09-28 06:00:01.536	658305794038825030	\N	\N	\N	\N
9c330e29-ece6-4f66-accf-d63ebc3e5846	-20	69	49	New Run Command Poll	2025-09-29 01:44:37.437	658305794038825030	\N	\N	\N	\N
9933df0e-d8c9-481b-8ef9-02a93bbbf7c8	-20	49	29	Approval Reaction	2025-09-29 01:44:43.215	658305794038825030	\N	\N	\N	\N
6445b9d4-0310-445b-9979-79b2dbb0c9bb	-70	80	10	Changed by admin	2025-09-29 02:25:31.634	645919565758464010	\N	\N	\N	\N
e5192320-c446-4dac-9027-52de12ee1f72	-70	90	20	Changed by admin	2025-09-29 02:25:46.201	780972375394091009	\N	\N	\N	\N
1beb2e23-2a2a-453f-8626-c19301ae6216	-70	471	401	Changed by admin	2025-09-29 02:26:04.335	844193954756689921	\N	\N	\N	\N
6bc6d335-8e3b-4d95-9f84-5f68472a3360	-3	29	26	Check Credit of Other Users	2025-09-29 02:26:15.502	658305794038825030	\N	\N	\N	\N
ae04d0c0-3d45-4d48-8407-6359a72d95ec	-3	26	23	Check Credit of Other Users	2025-09-29 02:26:56.078	658305794038825030	\N	\N	\N	\N
a0714779-e121-423b-867a-66bf90262331	-3	23	20	Check Permission Of Other Users	2025-09-29 03:05:00.103	658305794038825030	\N	\N	\N	\N
3265acc9-33cc-4c5d-9295-115e39a3887f	-20	20	0	New Run Command Poll	2025-09-29 05:01:27.272	658305794038825030	\N	\N	\N	\N
0df4c7e7-5960-4fc5-ab21-6ef5a3352e4e	-20	0	-20	Approval Reaction	2025-09-29 05:01:33.133	658305794038825030	\N	\N	\N	\N
79fb63b0-69e2-417e-95de-9563f93e6b46	-20	-20	-40	New Run Command Poll	2025-09-29 05:02:27.064	658305794038825030	\N	\N	\N	\N
fc421255-107b-47ca-8e24-871eaf9cabb1	-20	-40	-60	Approval Reaction	2025-09-29 05:02:33.248	658305794038825030	\N	\N	\N	\N
42b8c6c6-273b-4cc2-a408-fc62fdca95ed	-20	-60	-80	New Run Command Poll	2025-09-29 05:04:16.533	658305794038825030	\N	\N	\N	\N
1901523b-7b4b-4df6-b854-eb7eefcfbd2d	-20	-80	-100	Approval Reaction	2025-09-29 05:04:21.526	658305794038825030	\N	\N	\N	\N
c92efdb9-1348-4c4d-9e5e-c5390b543e99	-20	-100	-120	New Run Command Poll	2025-09-29 05:10:11.389	658305794038825030	\N	\N	\N	\N
ed32e0d6-82e1-4e86-85de-88be7d766592	-20	-120	-140	Approval Reaction	2025-09-29 05:10:16.474	658305794038825030	\N	\N	\N	\N
08981818-e7f0-4a22-a4e7-3ca94478fe27	-20	-140	-160	New Run Command Poll	2025-09-29 05:22:25.3	658305794038825030	\N	\N	\N	\N
f36b586e-4f48-40c0-aa43-7ab8106f4f0e	-20	-160	-180	Approval Reaction	2025-09-29 05:22:31.964	658305794038825030	\N	\N	\N	\N
a7b69608-c9c8-4dba-b661-209fb88e58a5	20	-180	-160	Daily Gift	2025-09-29 06:00:00.347	658305794038825030	\N	\N	\N	\N
146a03a0-bc2e-4263-9209-a000679e8c4d	20	10	30	Daily Gift	2025-09-29 06:00:00.775	645919565758464010	\N	\N	\N	\N
7ed0c108-21a0-4d59-9ebf-9fe15f434a75	20	20	40	Daily Gift	2025-09-29 06:00:01.144	780972375394091009	\N	\N	\N	\N
1591d05f-5305-43b7-8c00-1f280e96a426	-3	-160	-163	Check Permission Of Other Users	2025-09-29 14:35:16.05	658305794038825030	\N	\N	\N	\N
00dac4c4-e1f9-4177-817c-60486fcb0591	-3	-163	-166	Check Permission Of Other Users	2025-09-29 14:35:48.853	658305794038825030	\N	\N	\N	\N
511a6be5-f4c0-448a-9b34-b26960baeea5	20	30	50	Daily Gift	2025-09-30 06:00:00.968	645919565758464010	\N	\N	\N	\N
7cc73f43-f531-487e-985c-76c0d096596d	20	40	60	Daily Gift	2025-09-30 06:00:11.49	780972375394091009	\N	\N	\N	\N
59ca4fce-a5d3-4c8e-94f0-2d2ad3769255	20	-166	-146	Daily Gift	2025-09-30 06:00:11.507	658305794038825030	\N	\N	\N	\N
25982a76-34fb-4e72-b2c4-f6d371317325	20	50	70	Daily Gift	2025-10-01 06:00:00.419	645919565758464010	\N	\N	\N	\N
9056926c-d232-4734-b230-65f29c25c0a5	20	60	80	Daily Gift	2025-10-01 06:00:01.386	780972375394091009	\N	\N	\N	\N
7f252533-0d92-4925-9ace-ac34244af3ac	20	-146	-126	Daily Gift	2025-10-01 06:00:03.293	658305794038825030	\N	\N	\N	\N
f89ef192-aeb4-4b75-a7e6-031fbab8fbf9	20	70	90	Daily Gift	2025-10-02 06:00:00.921	645919565758464010	\N	\N	\N	\N
586831c2-dde2-4ffc-ab60-166c2931de0f	20	-126	-106	Daily Gift	2025-10-02 06:00:01.407	658305794038825030	\N	\N	\N	\N
f6c3710e-4c91-44a1-b12a-4ebd2f5329d1	-3	-106	-109	Check Credit of Other Users	2025-10-02 09:28:59.86	658305794038825030	\N	\N	\N	\N
3ba40680-c479-472c-a3f1-29e2f12f0fa4	20	-109	-89	Daily Gift	2025-10-03 06:00:01.382	658305794038825030	\N	\N	\N	\N
3fd9e09a-12ed-4467-abc4-10175540ddd5	20	-89	-69	Daily Gift	2025-10-04 06:00:01.803	658305794038825030	\N	\N	\N	\N
a066ba4d-6780-40fe-9165-0da5db18b31e	20	-69	-49	Daily Gift	2025-10-05 06:00:02.089	658305794038825030	\N	\N	\N	\N
3a51eef3-ef81-4b1e-ab92-ff1585de03dc	20	-49	-29	Daily Gift	2025-10-06 06:00:00.404	658305794038825030	\N	\N	\N	\N
403bc25b-5bda-4a13-ba6a-f532eb65adef	20	-29	-9	Daily Gift	2025-10-07 06:00:00.823	658305794038825030	\N	\N	\N	\N
cdbb1067-57ee-4e45-a3a3-86aec46dcca3	20	-9	11	Daily Gift	2025-10-08 06:00:01.298	658305794038825030	\N	\N	\N	\N
5e99b4f0-47c8-4281-8a8c-d492ac2ba784	20	11	31	Daily Gift	2025-10-09 06:00:01.653	658305794038825030	\N	\N	\N	\N
6c68e621-35f7-4140-b0c7-c8fd7dcaf9d3	20	31	51	Daily Gift	2025-10-10 06:00:02.142	658305794038825030	\N	\N	\N	\N
977e8ab9-c328-4130-bb20-1117348bb6e5	20	51	71	Daily Gift	2025-10-11 06:00:02.599	658305794038825030	\N	\N	\N	\N
6970684f-92b7-4866-b332-702be793d11f	-20	71	51	New Run Command Poll	2025-10-28 17:37:15.827	658305794038825030	\N	\N	\N	\N
8a727715-54b8-4a26-9bb7-0a0f580f8548	-20	401	381	Approval Reaction	2025-10-28 17:37:28.944	844193954756689921	\N	\N	\N	\N
fd3ae8f7-6d5c-4399-b155-32dccc230448	-20	51	31	Approval Reaction	2025-10-28 17:37:38.966	658305794038825030	\N	\N	\N	\N
1427307d-cf75-4d51-8932-8d065c6be47b	-20	31	11	Approval Reaction	2025-10-28 17:38:08.648	658305794038825030	\N	\N	\N	\N
e7702a11-5a11-4991-9084-caec8e6b0504	-20	80	60	Approval Reaction	2025-10-28 17:38:27.837	780972375394091009	\N	\N	\N	\N
ba28b019-c5b5-4e69-a6c6-48c065fc4c52	-3	11	8	Check Credit of Other Users	2025-10-28 17:38:43.044	658305794038825030	\N	\N	\N	\N
fa678bb9-1d13-4bb3-8906-ca8a07ba71b2	20	60	80	Daily Gift	2025-10-29 06:00:07.303	780972375394091009	\N	\N	\N	\N
67479aec-c70a-4f40-bb2f-4b520b3a447a	20	8	28	Daily Gift	2025-10-29 06:00:07.808	658305794038825030	\N	\N	\N	\N
66da0abf-1963-4335-b22f-f3efcb5054cd	20	28	48	Daily Gift	2025-10-30 06:00:07.806	658305794038825030	\N	\N	\N	\N
a9128c8e-d59f-4449-88bf-ddf6eb77af95	20	48	68	Daily Gift	2025-10-31 06:00:08.261	658305794038825030	\N	\N	\N	\N
7950fbd2-ef7c-4057-9513-3926d9efb322	20	68	88	Daily Gift	2025-11-01 06:00:08.694	658305794038825030	\N	\N	\N	\N
1bb30081-4e26-4b31-8216-c52a2e63a4ed	-70	88	18	Upload Custom Mod to Server	2025-11-21 04:38:59.352	658305794038825030	\N	\N	\N	\N
4a0dd84e-8d60-4759-8e47-307269badf4f	70	18	88	Refund for cancelled Upload Custom Mod to Server	2025-11-21 04:39:06	658305794038825030	\N	\N	\N	\N
3b9f2f0f-350a-456a-baa8-4111e645b432	-70	88	18	Upload Custom Mod to Server	2025-11-21 04:39:17.758	658305794038825030	\N	\N	\N	\N
c3f4b081-4ca6-4dfd-ac5b-3dcaec1f4f38	-20	18	-2	New Run Command Poll	2025-11-21 05:43:39.924	658305794038825030	\N	\N	\N	\N
a02e2d2a-80b3-469f-ae33-2f780184664e	-20	-2	-22	Approval Reaction	2025-11-21 05:43:46.909	658305794038825030	\N	\N	\N	\N
55f49a11-0978-4d9d-9407-afda26038dd9	-20	-22	-42	New Run Command Poll	2025-11-21 05:46:10.666	658305794038825030	\N	\N	\N	\N
fda337a7-ad22-4332-a079-444a4f227ca7	20	-42	-22	Daily Gift	2025-11-21 06:00:05.419	658305794038825030	\N	\N	\N	\N
93fd1155-56f3-4d72-bd73-53be42ae3a39	20	-22	-2	Daily Gift	2025-11-22 06:00:05.883	658305794038825030	\N	\N	\N	\N
46758d0e-6a43-485c-9a21-063854d47912	20	-2	18	Daily Gift	2025-11-23 06:00:06.279	658305794038825030	\N	\N	\N	\N
681eeb67-99c8-4539-8abf-886353f45aad	-20	18	-2	New Run Command Poll	2025-11-24 00:47:05.205	658305794038825030	\N	\N	\N	\N
51ac1565-003e-4563-872e-6a25eb8a265d	-20	-2	-22	New Run Command Poll	2025-11-24 00:47:37.738	658305794038825030	\N	\N	\N	\N
ef18fea1-0000-4c70-9d91-5fb01d83221e	-20	-22	-42	Approval Reaction	2025-11-24 00:47:42.377	658305794038825030	\N	\N	\N	\N
bfcaad27-59c6-47c6-8712-70d91d5814d1	-70	-42	-112	Upload Custom Mod to Server	2025-11-24 00:50:48.34	658305794038825030	\N	\N	\N	\N
125e45f7-67cd-4a88-9c79-7e909cf1c7e8	-70	-112	-182	Upload Custom Mod to Server	2025-11-24 01:45:45.405	658305794038825030	\N	\N	\N	\N
b397f77f-5fac-49df-b5a6-a9e75b89fd65	-20	-182	-202	New Run Command Poll	2025-11-24 01:55:26.973	658305794038825030	\N	\N	\N	\N
b03fad8b-aff6-4ffa-9f9c-9c1c6c2297ce	702	-202	500	Set by admin	2025-11-24 02:30:35.382	658305794038825030	\N	\N	\N	\N
5dd12bc7-3919-4d22-b9f9-fad99f86bbe8	-30	500	470	New Start Server Poll	2025-11-24 14:45:52.798	658305794038825030	1	\N	\N	\N
623039b4-abe0-46a4-9a8f-4b132544d017	-15	470	455	Approval Reaction	2025-11-24 14:45:58.503	658305794038825030	1	\N	\N	\N
88356042-805a-4962-9145-ab2e7bb1f505	-30	455	425	New Start Server Poll	2025-11-24 14:46:07.752	658305794038825030	1	\N	\N	\N
d73ba201-f1fa-4c92-b39a-1f2070bb200a	-15	425	410	Approval Reaction	2025-11-24 14:46:12.554	658305794038825030	1	\N	\N	\N
ed3aa508-68a3-4a32-a500-1a527b4a6006	-30	410	380	New Start Server Poll	2025-11-24 16:08:54.692	658305794038825030	1	\N	\N	\N
3112c3ef-e2ab-46f3-beae-1c1e9fdb8443	-30	380	350	New Start Server Poll	2025-11-24 16:10:46.496	658305794038825030	1	\N	\N	\N
93134ffa-ed74-47c2-8f63-5c1a9f34a646	-15	350	335	Approval Reaction	2025-11-24 16:10:50.944	658305794038825030	1	\N	\N	\N
401ae109-8d1b-4260-9be2-c84d652aa2e0	-30	335	305	New Stop Server Poll	2025-11-24 17:09:24.759	658305794038825030	1	\N	\N	\N
1add04b9-28ca-4772-8de2-94d78d7e35c4	-15	305	290	Approval Reaction	2025-11-24 17:09:30.495	658305794038825030	1	\N	\N	\N
e0ae537d-aaa0-4757-8a1b-1cec8ffc8557	-30	290	260	New Start Server Poll	2025-11-24 17:15:17.02	658305794038825030	1	\N	\N	\N
02de7b84-62ba-46fd-addd-aa8946ba537e	30	260	290	New Approval Poll Refund	2025-11-24 17:16:56.597	658305794038825030	1	\N	\N	\N
917b44ee-586c-449f-8672-52220936ad5e	-30	290	260	New Start Server Poll	2025-11-24 17:18:20.44	658305794038825030	2	\N	\N	\N
8c8370f0-2982-47ea-b1f8-9ba6d7ca6ed9	-15	260	245	Approval Reaction	2025-11-24 17:18:25.452	658305794038825030	2	\N	\N	\N
71f021d4-5aa2-4f7e-b72d-8d8d9570f140	-30	245	215	New Stop Server Poll	2025-11-24 17:19:33.974	658305794038825030	2	\N	\N	\N
655c00cd-6ba9-4cf5-b981-0a6148067c08	-15	215	200	Approval Reaction	2025-11-24 17:19:38.872	658305794038825030	2	\N	\N	\N
b0f9c92d-60ee-4c6d-9717-53355c48ac6b	-30	200	170	New Start Server Poll	2025-11-24 17:20:56.799	658305794038825030	2	\N	\N	\N
82018793-0764-4191-91ce-969d4d91c752	-15	170	155	Approval Reaction	2025-11-24 17:21:04.058	658305794038825030	2	\N	\N	\N
4f706858-612a-4322-8fd0-71489a79a3f6	-30	155	125	New Start Server Poll	2025-11-24 17:34:10.282	658305794038825030	1	\N	\N	\N
ed26a7a0-c4ce-476c-9622-a2eae9d9598c	-15	125	110	Approval Reaction	2025-11-24 17:34:14.072	658305794038825030	1	\N	\N	\N
8560aaaf-1ae3-4432-87b0-26f1b5bc90ff	-3	110	107	Check Credit of Other Users	2025-11-25 12:08:18.04	658305794038825030	\N	\N	\N	\N
82d043d7-acad-4ee0-b72b-b7c7435a75ef	-30	107	77	New Start Server Poll	2025-11-25 12:09:00.784	658305794038825030	2	\N	\N	\N
55f99d34-8cf1-4b2b-8908-d3931d5d88e9	-15	77	62	Approval Reaction	2025-11-25 12:09:06.281	658305794038825030	2	\N	\N	\N
41c86298-4e83-4e39-836d-d97226c5d76c	-3	62	59	Check Permission Of Other Users	2025-11-25 12:11:59.985	658305794038825030	\N	\N	\N	\N
9425198e-dfc4-492f-a72e-9e963d259818	-3	59	56	Check Permission Of Other Users	2025-11-25 12:13:13.929	658305794038825030	\N	\N	\N	\N
e05eb658-dc99-4582-9bcd-4438b4a46785	-3	56	53	Check Permission Of Other Users	2025-11-25 12:13:26.565	658305794038825030	\N	\N	\N	\N
60b7a278-7cbc-49cd-92ec-0fd6282605a3	-3	53	50	Check Permission Of Other Users	2025-11-25 12:16:21.221	658305794038825030	\N	\N	\N	\N
1b71dd73-20ae-4ca7-bfe3-0799afe992b4	-70	50	-20	Upload Custom Mod to Server	2025-11-25 13:59:15.025	658305794038825030	1	\N	\N	\N
34cafb07-b8ff-4481-95c6-2000b5358906	70	-20	50	Refund for cancelled Upload Custom Mod to Server	2025-11-25 14:00:12.829	658305794038825030	1	\N	\N	\N
946b9d72-dd35-403c-81e4-cd8948dfcc71	-70	50	-20	Upload Custom Mod to Server	2025-11-25 14:01:41.633	658305794038825030	2	\N	\N	\N
72021206-dcbc-44a3-b830-609c3e73110a	-70	-20	-90	Upload Custom Mod to Server	2025-11-25 14:04:24.623	658305794038825030	2	\N	\N	\N
31d84505-c155-4216-b435-ec4a63a8d003	-70	-90	-160	Upload Custom Mod to Server	2025-11-25 14:07:28.462	658305794038825030	2	\N	\N	\N
8323c3f4-27fa-478b-9443-a919de3d1807	-70	-160	-230	Upload Custom Mod to Server	2025-11-25 14:16:28.773	658305794038825030	2	\N	\N	\N
f026cd5d-8930-4de1-95bd-1d850f1c282a	70	-230	-160	Refund for cancelled Upload Custom Mod to Server	2025-11-25 14:16:36.364	658305794038825030	2	\N	\N	\N
2977fda0-56f3-4b0b-8518-93bae8de3335	-30	-160	-190	New Start Server Poll	2025-11-25 14:17:04.659	658305794038825030	1	\N	\N	\N
ec98e4d5-d77e-4aaf-b4ab-adf09dd52f41	-15	-190	-205	Approval Reaction	2025-11-25 14:17:19.22	658305794038825030	1	\N	\N	\N
0b2e28d2-3ce1-446c-a027-7211fd1c0ceb	-30	-205	-235	New Start Server Poll	2025-11-25 14:20:23.205	658305794038825030	1	\N	\N	\N
9ce02e20-0c5a-4232-bbd1-190aee2c853b	-15	-235	-250	Approval Reaction	2025-11-25 14:20:30.468	658305794038825030	1	\N	\N	\N
1ec1223e-3bfe-42f0-a26c-0c99034f2bc8	260	-250	10	Set by admin	2025-11-25 14:26:05.532	658305794038825030	\N	\N	\N	\N
d7c1ebc7-67c8-43e2-bedd-9905fe55ee1e	-30	10	-20	New Start Server Poll	2025-11-25 14:38:10.847	658305794038825030	2	\N	\N	\N
5fc6424f-962e-4d5c-9368-a34e57dfec1c	-15	-20	-35	Approval Reaction	2025-11-25 14:38:18.762	658305794038825030	2	\N	\N	\N
1e8c0000-dbf9-4ba9-8442-7c711c6cc9b1	-30	-35	-65	New Stop Server Poll	2025-11-25 14:45:28.79	658305794038825030	2	\N	\N	\N
f0c78a34-bfd1-4a43-8610-2eeb0f36f105	-15	-65	-80	Approval Reaction	2025-11-25 14:45:36.813	658305794038825030	2	\N	\N	\N
a250e0e4-fd1a-4f69-a4ad-131290783a58	-3	-80	-83	Check Permission Of Other Users	2025-11-25 14:55:02.476	658305794038825030	\N	\N	\N	\N
785c765e-8484-42b3-be7a-5e9c0b1fd8aa	-3	-83	-86	Check Permission Of Other Users	2025-11-25 14:55:23.35	658305794038825030	\N	\N	\N	\N
f018db0d-34f3-4fc1-bd7b-dec87fcf3fe4	-3	-86	-89	Check Permission Of Other Users	2025-11-25 14:56:05.926	658305794038825030	\N	\N	\N	\N
b9417158-1b01-4ae8-b193-034ca6f960db	-3	-89	-92	Check Permission Of Other Users	2025-11-25 15:57:29.88	658305794038825030	\N	\N	\N	\N
8b0fc8f0-cf3e-4bfd-a5ee-99356ee3541d	-30	-92	-122	New Start Server Poll	2025-11-25 15:57:42.284	658305794038825030	2	\N	\N	\N
27711b56-5a57-43b8-af81-61f7204d92f1	-15	-122	-137	Approval Reaction	2025-11-25 15:57:46.521	658305794038825030	2	\N	\N	\N
35489513-da75-43d0-9fb9-c3bd3587d017	-15	-137	-152	Approval Reaction	2025-11-25 15:57:50.355	658305794038825030	2	\N	\N	\N
de4c39a6-9cff-4f39-bbe9-3cfbee94829f	30	-152	-122	New Approval Poll Refund	2025-11-25 15:59:50.381	658305794038825030	2	\N	\N	\N
3ba0787a-15d4-4575-b7de-264e18190bb5	15	-122	-107	Approval Reaction Refund	2025-11-25 15:59:50.77	658305794038825030	2	\N	\N	\N
7647a616-6317-450e-bcaf-df5635d949cf	15	-107	-92	Approval Reaction Refund	2025-11-25 15:59:51.147	658305794038825030	2	\N	\N	\N
85bd64c2-a03e-4d7e-bb00-1b86eb2b49cd	-30	-92	-122	New Start Server Poll	2025-11-25 16:00:06.201	658305794038825030	2	\N	\N	\N
42877fa1-8db8-4a4a-902e-f89c9d0564a9	-15	-122	-137	Approval Reaction	2025-11-25 16:00:11.045	658305794038825030	2	\N	\N	\N
a07ab359-3c77-4251-8175-186d9182f5a5	-15	-137	-152	Approval Reaction	2025-11-25 16:00:17.833	658305794038825030	2	\N	\N	\N
f3f1f234-694f-4bec-855c-3d67262047a5	30	-152	-122	Approval Reaction Refund	2025-11-25 16:00:51.875	658305794038825030	\N	\N	\N	\N
5c4b7ad7-097d-4869-b8f2-b8f3b6fdbfdc	30	-122	-92	New Approval Poll Refund	2025-11-25 16:00:57.189	658305794038825030	2	\N	\N	\N
c6c3b027-2707-4d70-832d-5594fa3a033b	0	-92	-92	New Stop Server Poll	2025-11-25 16:55:23.758	658305794038825030	2	\N	\N	\N
8415bb55-bfd6-450d-8b64-293ca5b4af98	-3	-92	-95	Check Permission Of Other Users	2025-11-26 00:06:50.54	658305794038825030	\N	\N	\N	\N
8a4960f1-8d83-4e91-a350-891294feabe6	-30	-95	-125	New Start Server Poll	2025-11-26 03:56:30.674	658305794038825030	1	\N	\N	\N
76acae8a-14a9-4baf-809f-a16ce8d9e758	20	-125	-105	Daily Gift	2025-11-26 06:00:00.201	658305794038825030	\N	\N	\N	\N
6cfebeb6-edd3-451d-9c2c-188c78565064	20	-105	-85	Daily Gift	2025-11-27 06:00:00.41	658305794038825030	\N	\N	\N	\N
994e2b17-1648-4afe-9c27-a7ab51fd50b0	20	-85	-65	Daily Gift	2025-11-28 06:00:00.816	658305794038825030	\N	\N	\N	\N
7d12a381-9e35-4b03-98fe-d0a2f1df25b7	20	-65	-45	Daily Gift	2025-11-29 06:00:01.2	658305794038825030	\N	\N	\N	\N
22f384d9-80db-4706-a6a6-af4ddaa66818	20	-45	-25	Daily Gift	2025-11-30 06:00:01.67	658305794038825030	\N	\N	\N	\N
cd99ac6c-29c2-4843-abcb-ade0d69fda66	20	-25	-5	Daily Gift	2025-12-01 06:00:02.136	658305794038825030	\N	\N	\N	\N
fd18ca93-32f4-47c1-b489-c7ae40539a0f	20	-5	15	Daily Gift	2025-12-02 06:00:02.626	658305794038825030	\N	\N	\N	\N
45064f2c-6d67-49c8-a481-cd9996bfa5d4	20	15	35	Daily Gift	2025-12-03 06:00:03.061	658305794038825030	\N	\N	\N	\N
b0ac2f5d-2085-47e7-8e08-5e717f743f43	20	35	55	Daily Gift	2025-12-04 06:00:03.538	658305794038825030	\N	\N	\N	\N
6c4feb23-a08f-4368-ba23-6d10051311ff	20	55	75	Daily Gift	2025-12-05 06:00:03.951	658305794038825030	\N	\N	\N	\N
cc494786-bd60-4099-a50e-215039e7c6ea	-30	75	45	New Start Server Poll	2025-12-09 16:23:11.717	658305794038825030	1	\N	\N	\N
753fc4b0-cad7-4a24-9244-7d9ff5587cb2	-15	45	30	Approval Poll Reaction: Start Server at Ariuan's Server	2025-12-09 16:23:25.965	658305794038825030	1	\N	\N	\N
883b92b7-ccaa-43ed-8bd6-55c6aaac60b8	-6	30	24	New Start Server Poll (Using Ticket: testTicket, reduced 24 credits)	2025-12-09 16:38:21.302	658305794038825030	1	\N	\N	\N
b2550768-b2ae-45ea-bbbe-4e7b959bd136	-15	24	9	Approval Poll Reaction: Start Server at Ariuan's Server	2025-12-09 16:38:59.008	658305794038825030	1	\N	\N	\N
6506ba80-1a72-4305-aa3f-7388d221296b	30	9	39	New Approval Poll Refund	2025-12-09 16:47:24.601	658305794038825030	1	\N	\N	\N
6315047b-c00a-4595-83f2-24c637c29f70	15	39	54	Approval Reaction Refund	2025-12-09 16:47:25.063	658305794038825030	1	\N	\N	\N
5cb74ee7-eb03-44b8-b324-93dd734047e0	-30	54	24	New Start Server Poll	2025-12-09 16:48:10.834	658305794038825030	1	\N	\N	\N
998a0d27-2fb4-4d96-8e55-18101ccfb5c0	-15	24	9	Approval Poll Reaction: Start Server at Ariuan's Server	2025-12-09 16:48:22.126	658305794038825030	1	\N	\N	\N
309e1c00-512d-47e5-b521-0c60ab6d593a	-3	9	6	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket: testTicket, reduced 12 credits)	2025-12-09 16:48:41.077	658305794038825030	1	\N	\N	\N
11196a75-440c-48a0-892d-f847771947bc	-6	6	0	New Start Server Poll (Using Ticket: testTicket, reduced 24 credits)	2025-12-10 05:29:03.873	658305794038825030	1	\N	\N	\N
2b0e5709-5e25-4656-8452-44aacc10e8ed	-3	0	-3	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket: testTicket, reduced 12 credits)	2025-12-10 05:29:14.587	658305794038825030	1	\N	\N	\N
47adac4c-97b6-49b2-bf49-7c7d2609ebf3	20	-3	17	Daily Gift	2025-12-10 06:00:04.311	658305794038825030	\N	\N	\N	\N
177857c3-deb2-474e-803c-62177795974a	-30	17	-13	New Start Server Poll	2025-12-10 11:09:58.459	658305794038825030	1	\N	\N	\N
b02e4909-7bc2-4360-b8f5-e45bf7833f49	30	-13	17	New Approval Poll Refund	2025-12-10 11:11:50.443	658305794038825030	1	\N	\N	\N
ee1e6a35-9157-4575-a943-1770ccb7e61a	-30	17	-13	New Start Server Poll	2025-12-10 11:17:25.096	658305794038825030	1	\N	\N	\N
23dded3a-fbbb-48b4-a2a8-b4a56af1f5d1	-15	-13	-28	Approval Poll Reaction: Start Server at Ariuan's Server	2025-12-10 11:27:59.494	658305794038825030	1	\N	\N	\N
de220f63-8631-4f26-a9de-106e5717963b	-15	-28	-43	Approval Poll Reaction: Start Server at Ariuan's Server	2025-12-10 11:28:40.06	658305794038825030	1	\N	\N	\N
c479593f-6451-473c-8768-55033fbefbda	-3	-43	-46	Check credit of user 854694243712893008	2025-12-10 12:22:17.324	658305794038825030	\N	\N	\N	\N
a777c57e-cd03-426b-b4f9-ccad067f3172	-3	-46	-49	Check credit of user 854694243712893008	2025-12-10 12:27:58.697	658305794038825030	\N	\N	\N	\N
aafe46bd-2dcf-444d-a0d3-f622d5a34426	-3	-49	-52	Check credit of user 854694243712893008	2025-12-10 12:30:45.745	658305794038825030	\N	\N	\N	\N
d697ab4a-e0ee-4fe6-a000-879683886246	-3	-52	-55	Check credit of user Senara	2025-12-10 12:36:02.193	658305794038825030	\N	\N	\N	\N
a6a5d688-671c-45d9-babc-13d3e576f8ce	-3	-55	-58	Check credit of user Senara	2025-12-10 12:37:26.216	658305794038825030	\N	\N	\N	\N
d1ef1f9c-4abf-461d-b7cf-15cde8011142	-3	-58	-61	Check credit of user Senara	2025-12-10 12:38:26.101	658305794038825030	\N	\N	\N	\N
df006ef0-51e7-4e73-944a-526de2c83fe7	-3	-61	-64	Check credit of user Senara	2025-12-10 12:38:49.13	658305794038825030	\N	\N	\N	\N
80e32751-6b5b-4141-89c5-711acb667d80	-3	-64	-67	Check credit of user Senara	2025-12-10 12:39:18.081	658305794038825030	\N	\N	\N	\N
c533da6a-0575-4c74-ba06-5695b2f4820f	-3	-67	-70	Check credit of user Senara	2025-12-10 12:40:26.693	658305794038825030	\N	\N	\N	\N
fc901d84-829a-4057-824c-49f1efd43a7c	170	-70	100	Set by admin	2025-12-10 12:40:42.355	658305794038825030	\N	\N	\N	\N
fd0f2487-b67d-4531-9f8b-fa7823bb6251	-30	100	70	New Start Server Poll	2025-12-10 12:41:40.202	658305794038825030	1	\N	\N	\N
be111849-a446-497f-ab5a-4f59ff6735f3	30	70	100	New Approval Poll Refund	2025-12-10 12:45:38.972	658305794038825030	1	\N	\N	\N
1e30ab23-fab3-4033-b54a-3c0d42953b2b	-3	100	97	Check credit of user Senara	2025-12-10 12:50:25.745	658305794038825030	\N	\N	\N	\N
fc815e25-0f90-48b6-86fb-7d5c84da0fd5	-3	97	94	Check credit of user Senara	2025-12-10 12:50:51.821	658305794038825030	\N	\N	\N	\N
73d542fe-71a6-43a2-b7d9-dd31199a2446	-3	94	91	Check credit of user Senara	2025-12-10 12:51:35.569	658305794038825030	\N	\N	\N	\N
1c4e57f9-9165-48d3-97d5-5e716eeb10fa	-1	91	90	Check credit of user Senara (Using Ticket: Test Ticket, reduced 2 credits)	2025-12-10 12:53:40.5	658305794038825030	\N	\N	\N	\N
354376ab-8da8-475b-b92a-7d775c7c6e36	-3	90	87	Check credit of user Senara	2025-12-10 12:59:42.534	658305794038825030	\N	\N	\N	\N
e81c50d4-e2bd-49e9-9fd1-ea55b89fd8df	-3	87	84	Check credit of user Senara	2025-12-10 13:00:29.903	658305794038825030	\N	\N	\N	\N
256a421d-a946-4707-9daf-746b288e1c07	-12	84	72	New Start Server Poll (Using Ticket: Test Ticket, saved 18 credits)	2025-12-10 13:21:54.444	658305794038825030	2	\N	\N	\N
d55ed70b-4864-486c-90fa-8e3088bcce75	-6	72	66	Approval Poll Reaction: Start Server at Cobblemon by Ariuan (Using Ticket: Test Ticket, saved 9 credits)	2025-12-10 13:22:13.388	658305794038825030	2	\N	\N	\N
547624f3-857d-428b-a9b3-12db0eae5721	-15	66	51	Approval Poll Reaction: Start Server at Cobblemon by Ariuan	2025-12-10 13:22:21.819	658305794038825030	2	\N	\N	\N
3c74f0e3-dfe8-4be0-94cc-d7edac62d0dd	-15	51	36	Approval Poll Reaction: Start Server at Cobblemon by Ariuan	2025-12-10 14:00:22.702	658305794038825030	2	\N	\N	\N
e012e71a-bba2-4f5f-bb14-b95b61200b3d	-3	36	33	Checking tickets for user wingwing8709	2025-12-10 14:23:23.259	658305794038825030	\N	\N	\N	\N
53382fef-18b1-4bd2-a5b4-47fdd6fb0a50	-3	33	30	Checking tickets for user wingwing8709	2025-12-10 14:29:26.726	658305794038825030	\N	\N	\N	\N
f148f662-fe11-46fb-8a5c-c0b6a48dacf1	20	30	50	Daily Gift	2025-12-11 06:00:00.308	658305794038825030	\N	\N	\N	\N
e2fa02ca-f3b3-4314-9b8d-bbb912dd145d	-3	50	47	Checking tickets for user wingwing8709	2025-12-11 10:04:53.13	658305794038825030	\N	\N	\N	\N
aaff2a20-dad5-4ce0-aad5-0019bdae79a1	-3	47	44	Checking tickets for user wingwing8709	2025-12-11 10:14:12.421	658305794038825030	\N	\N	\N	\N
a868dd91-412f-4dd4-8743-84395f5e3032	0	44	44	Check credit of user wingwing (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 3 credits)	2025-12-11 12:17:30.11	658305794038825030	\N	\N	\N	\N
a6656d2c-5aa3-4cb1-8759-0fe01077a66d	0	44	44	Check credit of user wingwing (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 3 credits)	2025-12-11 12:28:58.962	658305794038825030	\N	\N	\N	\N
0493772d-609b-465a-a08b-1a2d296647c2	20	44	64	Daily Gift	2025-12-12 06:00:00.343	658305794038825030	\N	\N	\N	\N
9007d7d4-c0d4-4202-b9d0-1c9bc48d4141	20	64	84	Daily Gift	2025-12-13 06:00:00.388	658305794038825030	\N	\N	\N	\N
8cb4df82-e2c2-481b-a82e-ff7a09387136	-1	84	83	Checking tickets for user wingwing8709 (Using Ticket: Test Ticket, saved 2 credits)	2025-12-15 05:41:29.917	658305794038825030	\N	\N	\N	\N
3e1ec565-39a4-4038-bf25-a8c10b4dfaa8	-1	83	82	Checking tickets for user wingwing8709 (Using Ticket: Test Ticket, saved 2 credits)	2025-12-18 15:25:37.61	658305794038825030	\N	\N	\N	\N
384e7c93-e0fd-4db5-ad38-72ca3d83b856	-3	82	79	Refresh DNS Record	2026-01-09 12:09:20.653	658305794038825030	\N	\N	\N	\N
b12f3807-14de-4f56-aaeb-216e4404e0b6	-8	79	71	New Run Command Poll (Using Ticket: Test Ticket, saved 12 credits)	2026-01-30 14:25:01.599	658305794038825030	1	\N	\N	\N
395964b7-8c7c-4df1-a7a4-7735e5662664	-20	335	315	Approval Poll Reaction: kill generral	2026-01-30 14:25:15.053	709605543358234674	1	\N	\N	\N
f24f888e-91b4-4f1a-a742-ce1cffeea2ab	-20	80	60	Approval Poll Reaction: kill generral	2026-01-30 14:25:21.571	780972375394091009	1	\N	\N	\N
83191e87-869d-4182-bbc9-29e6b6d6f1f1	20	60	80	Approval Reaction Refund	2026-01-30 14:26:47.487	780972375394091009	\N	\N	\N	\N
979b7384-ce9c-481b-be80-60e684f6857b	-15	80	65	Approval Poll Reaction: kill generral (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-01-30 14:27:26.469	780972375394091009	1	\N	\N	\N
d7c6331a-28ec-48fc-b0b3-fdb63c928585	-15	71	56	Approval Poll Reaction: kill generral (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-01-30 14:34:24.298	658305794038825030	1	\N	\N	\N
1dc59aa0-fb5b-4d62-8a96-ddbb2a220d10	-8	56	48	Approval Poll Reaction: kill generral (Using Ticket: Test Ticket, saved 12 credits)	2026-01-30 16:03:31.549	658305794038825030	1	\N	\N	\N
dd0cb987-b045-4594-b959-dfc61d9870d9	20	65	85	Daily Gift	2026-01-31 06:00:08.429	780972375394091009	\N	\N	\N	\N
668003fe-67a2-4127-bec8-4b7fdadb9e6a	20	48	68	Daily Gift	2026-01-31 06:00:09.174	658305794038825030	\N	\N	\N	\N
a0cb2758-23c5-4bf6-80a3-bd4982b84c79	-25	381	356	New Start Server Poll (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-01-31 15:27:22.488	844193954756689921	1	\N	\N	\N
ea57dc27-134e-4db4-80b6-914ba39efbf1	-15	356	341	Approval Poll Reaction: Start Server at Ariuan's Server	2026-01-31 15:27:31.8	844193954756689921	1	\N	\N	\N
f688ba8a-89cd-4cb3-a42d-12d694e1c308	-10	90	80	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-01-31 15:30:00.07	645919565758464010	1	\N	\N	\N
c7aaa463-d62c-4b1c-8bb3-91e0ff34f3e4	-15	85	70	Approval Poll Reaction: Start Server at Ariuan's Server	2026-01-31 15:31:34.791	780972375394091009	1	\N	\N	\N
9f4a494d-38bd-4a93-86ee-9ea61f86ab43	20	68	88	Daily Gift	2026-02-01 06:00:08.844	658305794038825030	\N	\N	\N	\N
60cb78cf-33de-41de-9727-36d6ad47c73d	20	70	90	Daily Gift	2026-02-01 06:00:09.355	780972375394091009	\N	\N	\N	\N
1a9da996-a009-4797-815c-88321578f1d6	-30	88	58	New Start Server Poll	2026-02-01 10:30:12.883	658305794038825030	1	\N	\N	\N
2f92a0bd-7a6a-4a2c-b0af-477b212d3ae3	-15	58	43	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-01 10:30:26.017	658305794038825030	1	\N	\N	\N
57bc5a20-1f82-48ad-8583-516fe5f06ce7	-12	43	31	New Start Server Poll (Using Ticket: Test Ticket, saved 18 credits)	2026-02-01 11:31:58.199	658305794038825030	1	\N	\N	\N
98e5bf73-dd48-4159-b282-a9cf257139c1	-6	31	25	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket: Test Ticket, saved 9 credits)	2026-02-01 11:32:18.778	658305794038825030	1	\N	\N	\N
fc200a58-a9cc-4536-b597-fa681024380d	-10	25	15	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-02-01 11:33:04.36	658305794038825030	1	\N	\N	\N
68c212bd-fef1-4b22-aedd-ad79d70c5898	-12	15	3	New Start Server Poll (Using Ticket: Test Ticket, saved 18 credits)	2026-02-01 11:44:51.893	658305794038825030	1	\N	\N	\N
17dde4dd-f942-4374-a950-164dc15ac647	30	3	33	New Approval Poll Refund	2026-02-01 11:47:27.197	658305794038825030	1	\N	\N	\N
c43b29e4-096c-45c5-895d-aede85521856	-12	33	21	New Start Server Poll (Using Ticket: Test Ticket, saved 18 credits)	2026-02-01 11:48:03.575	658305794038825030	1	\N	\N	\N
121add96-de88-403b-834b-6d5049c757f4	30	21	51	New Approval Poll Refund	2026-02-01 11:49:32.161	658305794038825030	1	\N	\N	\N
51c749d4-f157-44fc-9765-fb29f53bbf72	-25	51	26	New Start Server Poll (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-02-01 11:49:52.321	658305794038825030	1	\N	\N	\N
ba49fa22-64af-4f9d-890e-a74d706c6011	30	26	56	New Approval Poll Refund	2026-02-01 11:50:53.186	658305794038825030	1	\N	\N	\N
2ac65b41-8f01-425a-8a76-191b124befe3	-12	56	44	New Start Server Poll (Using Ticket: Test Ticket, saved 18 credits)	2026-02-01 11:51:21.043	658305794038825030	2	\N	\N	\N
ec2362f1-a28a-4c31-b023-0c61b8de2ec5	-10	44	34	Approval Poll Reaction: Start Server at Cobblemon by Ariuan (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-02-01 11:51:43.529	658305794038825030	2	\N	\N	\N
45f96080-ed64-46f3-8681-a5a5db477d1f	-70	34	-36	Upload Custom Mod to Server	2026-02-01 18:41:56.887	658305794038825030	1	\N	\N	\N
7b5b3d42-dbc6-4e1a-b800-d5823ff657f4	20	-36	-16	Daily Gift	2026-02-02 06:00:00.394	658305794038825030	\N	\N	\N	\N
ce7c6550-e72d-421c-a2fc-1e850f9061e7	-48	-16	-64	Edit File ../../../ed (Using Ticket: Test Ticket, saved 72 credits)	2026-02-02 17:08:03.872	658305794038825030	1	\N	\N	\N
cdd8aaaa-967e-4f46-9858-f8ea6b1e769a	-70	-64	-134	Upload Custom Mod to Server	2026-02-02 17:13:14.256	658305794038825030	1	\N	\N	\N
9e4620ff-2533-45c7-b699-1c30507679ec	70	-134	-64	Refund for cancelled Upload Custom Mod to Server	2026-02-02 17:13:23.742	658305794038825030	1	\N	\N	\N
290f7120-46be-47ec-b5c1-c2fde56a868a	-70	1461	1391	Upload Custom Mod to Server	2026-02-02 17:16:06.605	678185861275189258	1	\N	\N	\N
287b37d9-029f-424d-95f4-009a450b8a69	-65	1391	1326	Upload Custom Mod to Server (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-02-02 17:17:15.948	678185861275189258	1	\N	\N	\N
918774e8-5972-4e50-bf3d-72a480fb0d10	-65	1326	1261	Upload Custom Mod to Server (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-02-02 17:19:10.651	678185861275189258	1	\N	\N	\N
4798ea89-d3ac-4b11-be0a-aca2a3fd0c34	-65	1261	1196	Upload Custom Mod to Server (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-02-02 17:20:50.674	678185861275189258	2	\N	\N	\N
9f83d3f2-0776-47c7-a0d8-0a27c63b4dcf	-65	1196	1131	Upload Custom Mod to Server (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-02-02 17:24:04.68	678185861275189258	1	\N	\N	\N
9f068277-0793-459b-bf6b-0f12dcdb7c9e	20	-64	-44	Daily Gift	2026-02-03 06:00:00.303	658305794038825030	\N	\N	\N	\N
01969e0c-6583-4dff-97ad-3270658712fe	-20	-44	-64	List Files (root)	2026-02-03 06:15:47.494	658305794038825030	1	\N	\N	\N
03d52d01-de9c-43e5-8c7f-87fe8fcabf4a	-20	-64	-84	List Files (root)	2026-02-03 06:22:01.828	658305794038825030	1	\N	\N	\N
d439bda6-7d34-404f-b8fa-b23578a00ec2	-20	-84	-104	List Files bluemap	2026-02-03 06:22:13.192	658305794038825030	1	\N	\N	\N
267c35a5-62e9-4fea-ab2f-7d52981a7bec	-20	-104	-124	List Files bluemap/logs	2026-02-03 06:22:27.146	658305794038825030	1	\N	\N	\N
26a635ad-4dd9-4cfb-9cae-012658f36722	-20	-124	-144	List Files (root)	2026-02-03 06:26:49.311	658305794038825030	2	\N	\N	\N
94247a22-864b-464a-a947-680b96169275	-20	-144	-164	List Files (root)	2026-02-03 06:28:13.64	658305794038825030	2	\N	\N	\N
53545742-bfc4-4e6a-b1c6-57d50fc23279	-20	-164	-184	List Files (root)	2026-02-03 06:31:00.118	658305794038825030	1	\N	\N	\N
702cbda9-301f-4efb-8b5f-e3cda679f6e3	-20	-184	-204	List Files (root)	2026-02-03 06:32:28.694	658305794038825030	1	\N	\N	\N
6a6a62c1-48b5-4480-b567-d63d87ca3c8c	-20	-204	-224	List Files (root)	2026-02-03 06:35:31.043	658305794038825030	1	\N	\N	\N
77af127d-1422-4684-afc8-58c14449f8b9	-20	-224	-244	List Files (root)	2026-02-03 06:38:05.632	658305794038825030	2	\N	\N	\N
78d0cde7-d389-464e-bfe0-197e719c47fa	-20	-244	-264	List Files (root)	2026-02-03 06:51:31.695	658305794038825030	1	\N	\N	\N
618ed4cb-12dc-46d1-b8ce-461a0b5377a8	-20	-264	-284	List Files (root)	2026-02-03 06:59:11.813	658305794038825030	2	\N	\N	\N
a6ff8095-87a8-4815-8b0c-8869d183e7d2	-20	-284	-304	List Files (root)	2026-02-03 07:07:02.487	658305794038825030	1	\N	\N	\N
af23e476-1c83-4973-bb72-30e5a0f20887	-20	-304	-324	List Files (root)	2026-02-03 07:18:15.436	658305794038825030	1	\N	\N	\N
6b0f215d-687b-487f-aae9-56119701ebcb	-60	-324	-384	View File config/paper-global.yml	2026-02-03 07:18:45.321	658305794038825030	1	\N	\N	\N
bc1b8d9c-a1fd-44fc-8bed-6fb957e1874e	-60	-384	-444	View File config/paper-global.yml	2026-02-03 07:42:30.438	658305794038825030	1	\N	\N	\N
ea6405c1-a0a9-4571-bd6e-0f0c0d4c2042	-60	-444	-504	View File config/paper-global.yml	2026-02-03 07:44:09.142	658305794038825030	1	\N	\N	\N
2b5685e1-c2d4-49c9-b4e0-e5fe688765dc	-60	-504	-564	View File config/paper-global.yml	2026-02-03 07:45:14.902	658305794038825030	1	\N	\N	\N
603cf91d-3cac-46bd-b691-4d221b72a4b8	-120	-564	-684	Edit File file:config/paper-global.yml	2026-02-03 07:47:53.349	658305794038825030	1	\N	\N	\N
5ecd5a75-3a4c-467d-ab79-6a0bce3374e0	120	-684	-564	Edit File Request Failed Refund	2026-02-03 07:47:53.73	658305794038825030	1	\N	\N	\N
cd6e3772-85d4-4024-a735-0c6d3c6efc77	-120	-564	-684	Edit File config/paper-global.yml	2026-02-03 07:48:17.677	658305794038825030	1	\N	\N	\N
bf0d6017-e3d4-4b9a-b1ec-3adf696ed36a	-120	-684	-804	Edit File config/paper-global.yml	2026-02-03 08:03:43.577	658305794038825030	1	\N	\N	\N
4f5e090d-7eeb-4bc1-a1ba-718c6e6a3272	-30	90	60	New Start Server Poll	2026-02-03 08:06:11.816	780972375394091009	1	\N	\N	\N
65850849-fdd8-47dc-b763-5503c9826066	-15	60	45	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-03 08:06:25.916	780972375394091009	1	\N	\N	\N
fa4424d8-7e56-4c92-a4a5-2b797588a34f	-60	-804	-864	View File config/paper-global.yml	2026-02-03 08:06:35.053	658305794038825030	1	\N	\N	\N
d17a9fff-0a29-4468-b38a-7a4969133fe9	-15	341	326	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-03 08:06:38.906	844193954756689921	1	\N	\N	\N
c8f2289c-c30a-4770-a29b-cf551b1e2ad5	30	45	75	New Approval Poll Refund	2026-02-03 08:07:47.83	780972375394091009	1	\N	\N	\N
0f6e9e8c-0242-4674-84b9-6020c6fcf62a	30	45	75	New Approval Poll Refund	2026-02-03 08:07:47.823	780972375394091009	1	\N	\N	\N
3648abe4-c713-44d1-81cd-12aa4ff51d6e	15	75	90	Approval Reaction Refund	2026-02-03 08:07:48.511	780972375394091009	1	\N	\N	\N
5bf5ed60-3968-49f6-b170-856793351564	15	90	105	Approval Reaction Refund	2026-02-03 08:07:48.923	780972375394091009	1	\N	\N	\N
fa85e5f9-652e-4ede-8ae4-71abc6936025	15	326	341	Approval Reaction Refund	2026-02-03 08:07:49.331	844193954756689921	1	\N	\N	\N
70bfce27-2454-49d9-9568-cccb0a5adfe9	15	341	356	Approval Reaction Refund	2026-02-03 08:07:49.673	844193954756689921	1	\N	\N	\N
ff61975f-617c-43cd-a8c7-0ef4f1f491ae	-60	-864	-924	View File config/paper-global.yml	2026-02-03 08:08:54.122	658305794038825030	1	\N	\N	\N
508f93c8-edb5-4033-b8d6-9fc5acff6af3	-60	-924	-984	View File config/paper-global.yml	2026-02-03 08:09:50.269	658305794038825030	1	\N	\N	\N
a186af5c-d024-4791-a0b6-03841abd78c6	-60	-984	-1044	View File config/paper-global.yml	2026-02-03 08:10:20.749	658305794038825030	1	\N	\N	\N
e24d5fa6-08bb-42e5-b5ca-12dd8dbd56d7	-60	-1044	-1104	View File config/paper-global.yml	2026-02-03 08:11:09.9	658305794038825030	1	\N	\N	\N
1c9d736f-216b-46de-98b8-083ac6a7aa6f	-120	1131	1011	Edit File config/paper-global.yml	2026-02-03 08:12:22.391	678185861275189258	1	\N	\N	\N
9227b8b3-7814-410c-b9b2-bf922dafe5ce	-20	-1104	-1124	List Files (root)	2026-02-03 08:28:32.409	658305794038825030	1	\N	\N	\N
a1414fa9-ea06-4091-b906-634018c73f47	-120	1011	891	Edit File whitelist.json	2026-02-03 09:00:59.86	678185861275189258	1	\N	\N	\N
79889959-88ad-4888-a431-de6bd757c5b3	-20	-1124	-1144	List Files plugins	2026-02-03 11:48:33.514	658305794038825030	1	\N	\N	\N
dbce4812-e200-4956-b7e8-efaee8ab53c8	-30	-1144	-1174	View File plugins/CoreProtect/config.yml	2026-02-03 11:49:29.516	658305794038825030	1	\N	\N	\N
c24ab2fe-f94e-425f-b697-b40e47bdb8ab	-12	-1174	-1186	New Start Server Poll (Using Ticket: Test Ticket, saved 18 credits)	2026-02-03 11:51:16.11	658305794038825030	1	\N	\N	\N
c7ddcc97-2f46-4bfb-bec3-a21d00eb09a8	-15	-1186	-1201	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-03 11:51:36.722	658305794038825030	1	\N	\N	\N
9eb95c3b-5798-4a0d-a247-ce1385991202	-30	-1201	-1231	New Start Server Poll	2026-02-03 13:42:53.655	658305794038825030	1	\N	\N	\N
331ab98d-6d1e-4cbb-b762-feb19707f025	-15	-1231	-1246	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-03 13:43:06.988	658305794038825030	1	\N	\N	\N
339fda85-5cf2-45cb-8dcd-6a399022b4bc	-15	356	341	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-03 13:43:23.45	844193954756689921	1	\N	\N	\N
2523e167-d5c1-4cbd-bbe0-0d084b9b6b89	1346	-1246	100	Set by admin	2026-02-03 13:44:04.509	658305794038825030	\N	\N	\N	\N
31a91f2f-c2a3-4783-a26a-6d7a62350020	-15	105	90	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-03 13:45:55.933	780972375394091009	1	\N	\N	\N
6e6f6950-9ac7-4df6-8533-66500ca98206	-3	100	97	Checking tickets for user aiden_wong724	2026-02-03 13:46:08.158	658305794038825030	\N	\N	\N	\N
f4c53d39-3bf2-468a-92f4-b7c08e5614f6	-70	97	27	Upload Custom Mod to Server	2026-02-03 15:28:53.816	658305794038825030	1	\N	\N	\N
af93b89d-3e10-414e-9fc3-0832e05cdc83	-70	27	-43	Upload Custom Mod to Server	2026-02-03 15:51:07.498	658305794038825030	1	\N	\N	\N
16357a61-3f32-41c9-b262-d213e67e4911	-70	-43	-113	Upload Custom Mod to Server	2026-02-03 15:56:54.657	658305794038825030	1	\N	\N	\N
aad07288-a632-4db1-91dc-ca2008b6924b	-20	-113	-133	List Files (root)	2026-02-03 19:28:18.161	658305794038825030	1	\N	\N	\N
f8fec423-f9f3-40d6-b93e-a03e7d3b7ab2	-20	-133	-153	List Files (root)	2026-02-03 20:05:09.065	658305794038825030	1	\N	\N	\N
6e2febd9-6604-4566-95d6-8c683a39784f	-20	-153	-173	List Files (root)	2026-02-03 20:06:52.827	658305794038825030	1	\N	\N	\N
567a0a3e-6822-49f8-bc94-fa7473037bec	-20	-173	-193	List Files (root)	2026-02-03 20:09:20.019	658305794038825030	1	\N	\N	\N
1c86ed60-6e7d-4509-9260-4f62bd17c472	-20	-193	-213	List Files (root)	2026-02-03 20:10:15.543	658305794038825030	1	\N	\N	\N
b89c89e7-11e7-4e71-ab80-89e637d1986e	-20	-213	-233	List Files (root)	2026-02-03 20:12:03.299	658305794038825030	1	\N	\N	\N
f2707b7d-4aa6-4a3c-b834-bbe4f08c06ff	20	-233	-213	Daily Gift	2026-02-04 06:00:00.255	658305794038825030	\N	\N	\N	\N
37d85e3f-4763-49a7-913a-e41a0e69f620	20	-213	-193	Daily Gift	2026-02-05 06:00:00.679	658305794038825030	\N	\N	\N	\N
98eaab78-ca24-4798-91b4-c4c391cf7547	-20	-193	-213	New Run Command Poll	2026-02-05 08:06:43.788	658305794038825030	1	\N	\N	\N
4ba32a90-9295-415c-85e7-93d66d44b732	-20	90	70	Approval Poll Reaction: ban generral	2026-02-05 08:07:31.214	780972375394091009	1	\N	\N	\N
36b0a8c8-fdd4-40ba-a8b4-e13ff4cdd1f9	-15	80	65	Approval Poll Reaction: ban generral (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-02-05 08:07:35.307	645919565758464010	1	\N	\N	\N
728b112f-66a3-4db9-b3e1-c30402e03906	-20	-213	-233	Approval Poll Reaction: ban generral	2026-02-05 08:08:51.437	658305794038825030	1	\N	\N	\N
b38cf4ea-735b-4a03-ac66-ca8393c29c48	-30	-233	-263	New Start Server Poll	2026-02-05 12:24:25.141	658305794038825030	1	\N	\N	\N
54fe3170-25ca-44b3-a6d1-f1b85ad25061	-15	-263	-278	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-05 12:24:38.763	658305794038825030	1	\N	\N	\N
3ab43e95-54dd-4a25-90f5-0f8264764abc	-15	-278	-293	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-05 12:30:28.479	658305794038825030	1	\N	\N	\N
eee2e225-9c85-4d16-b1f6-1dba90347b2d	-15	-293	-308	List Files (root) (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-02-05 14:40:58.38	658305794038825030	1	\N	\N	\N
3bea28bf-7515-4ece-a26a-b94cb238e28c	20	70	90	Daily Gift	2026-02-06 06:00:00.452	780972375394091009	\N	\N	\N	\N
cda5298d-a7d5-451c-857d-6e39b28cb187	20	65	85	Daily Gift	2026-02-06 06:00:00.932	645919565758464010	\N	\N	\N	\N
c676dc32-e149-4e97-830f-1c8c768a0e07	20	-308	-288	Daily Gift	2026-02-06 06:00:01.492	658305794038825030	\N	\N	\N	\N
c6dd6616-4ec3-4a1d-8b1e-e96fa1d6a8de	20	-288	-268	Daily Gift	2026-02-07 06:00:00.934	658305794038825030	\N	\N	\N	\N
5010787f-2263-4a08-9361-5822e8b9e562	-30	-268	-298	New Start Server Poll	2026-02-07 13:44:17.582	658305794038825030	1	\N	\N	\N
ca9be770-9bb4-4e26-a407-23c3f5a69dee	-15	-298	-313	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-07 13:45:55.01	658305794038825030	1	\N	\N	\N
2d427425-99eb-4fa0-abbf-918bfa2808be	-20	-313	-333	List Files (root)	2026-02-07 18:13:55.247	658305794038825030	1	\N	\N	\N
f043c912-90e8-4c2e-b282-9266e8146b5e	-30	-333	-363	View File world/level.dat	2026-02-07 18:14:27.64	658305794038825030	1	\N	\N	\N
b1d68626-334d-4bfd-8b9c-0996b24bd24f	20	-363	-343	Daily Gift	2026-02-08 06:00:01.34	658305794038825030	\N	\N	\N	\N
5b6c748b-9be9-4197-bb88-8db6541d9315	363	-343	20	Set by admin	2026-02-08 07:23:18.712	658305794038825030	\N	\N	\N	\N
02ec7fc7-002d-470c-9164-c9021bb0fc6f	-30	90	60	New Start Server Poll	2026-02-08 08:09:54.794	780972375394091009	1	\N	\N	\N
f07d6a0a-258f-45b5-809d-423a10e8c493	-15	60	45	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-08 08:10:06.832	780972375394091009	1	\N	\N	\N
8d4d8985-e7f9-417e-ac88-de2aec6f5b84	-15	20	5	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-08 08:10:17.936	658305794038825030	1	\N	\N	\N
470f81e9-8463-43f8-b797-74bd1336f8d9	-10	85	75	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket: Celebrate Cobblemon by Ariuan!, saved 5 credits)	2026-02-08 08:11:07.331	645919565758464010	1	\N	\N	\N
7fcb7274-36ef-4c01-bd9b-eac41380c92d	-70	5	-65	Upload Custom Mod to Server	2026-02-08 09:18:00.322	658305794038825030	1	\N	\N	\N
bf38828e-74f8-4d02-ad6b-cbc1df231ebf	-70	-65	-135	Upload Custom Mod to Server	2026-02-08 13:00:44.395	658305794038825030	1	\N	\N	\N
4d84bd47-34f7-4d1d-b724-5705236d83b1	20	45	65	Daily Gift	2026-02-09 06:00:01.772	780972375394091009	\N	\N	\N	\N
0ea84c73-cf65-44e5-b69b-4debcb2130a9	20	-135	-115	Daily Gift	2026-02-09 06:00:02.578	658305794038825030	\N	\N	\N	\N
96970d53-334f-44f6-a901-67121e56e575	-3	-115	-118	Check credit of user A蛋黃	2026-02-09 15:34:21.893	658305794038825030	\N	\N	\N	\N
2e4f4835-1f2b-4fc5-91fd-09faf79a2ef6	-20	-118	-138	List Files (root)	2026-02-09 16:31:24.611	658305794038825030	1	\N	\N	\N
05c6f514-6a9d-42e3-80ea-90cc0d8b83bb	-120	-138	-258	Edit File server.properties	2026-02-09 16:32:01.033	658305794038825030	1	\N	\N	\N
27c59b64-04be-4081-abd1-d3cebfca0cbe	20	65	85	Daily Gift	2026-02-10 06:00:02.194	780972375394091009	\N	\N	\N	\N
3c72b20c-b6c7-4540-9ebc-dc63610d7292	20	-258	-238	Daily Gift	2026-02-10 06:00:02.974	658305794038825030	\N	\N	\N	\N
4ba96e8a-3b9a-4cca-b236-ed51b7317eee	20	-238	-218	Daily Gift	2026-02-11 06:00:02.591	658305794038825030	\N	\N	\N	\N
e29408c1-912f-4171-84d8-8ec11606abe2	-30	-218	-248	New Start Server Poll	2026-02-11 13:48:58.558	658305794038825030	1	\N	\N	\N
80588b02-78b5-42b2-be56-a258027565a7	-15	-248	-263	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-11 14:27:29.252	658305794038825030	1	\N	\N	\N
c595c5fb-d144-4ea9-8dbb-6f0321242f12	20	-263	-243	Daily Gift	2026-02-12 06:00:03.04	658305794038825030	\N	\N	\N	\N
14022719-1600-47e5-8b4f-32048f369d6d	20	-243	-223	Daily Gift	2026-02-13 06:00:03.496	658305794038825030	\N	\N	\N	\N
a86b7d60-3a18-4341-8083-f10a883a77bb	120	315	435	Changed by admin	2026-02-13 07:07:31.905	709605543358234674	\N	\N	\N	\N
971a7d8b-da13-48f6-87cc-c8c9990dd20d	120	891	1011	Changed by admin	2026-02-13 07:07:31.939	678185861275189258	\N	\N	\N	\N
88b68707-3163-4b39-8cb7-6c3e36e291e1	120	0	120	Changed by admin	2026-02-13 07:07:31.984	1372227913923039312	\N	\N	\N	\N
877b02d6-e525-4658-a096-83712754d592	120	65	185	Changed by admin	2026-02-13 07:07:32.005	950063797358428260	\N	\N	\N	\N
61dcddf4-2728-47f2-95b4-bb20014fac16	120	341	461	Changed by admin	2026-02-13 07:07:32.021	844193954756689921	\N	\N	\N	\N
ab5a7522-8096-4a40-91e1-60512a146bae	120	80	200	Changed by admin	2026-02-13 07:07:32.034	804333943775559680	\N	\N	\N	\N
7977caa5-33c2-44d7-bb3d-c489c292ea45	120	80	200	Changed by admin	2026-02-13 07:07:32.047	841246467536584704	\N	\N	\N	\N
328ff121-cf39-479d-9ec1-505a24fc35c1	120	0	120	Changed by admin	2026-02-13 07:07:32.061	825752488388329514	\N	\N	\N	\N
5c2ae229-5fc0-4eff-9756-1743be0d23eb	120	75	195	Changed by admin	2026-02-13 07:07:32.073	645919565758464010	\N	\N	\N	\N
c7ebec80-bb7f-4347-b2a9-010e915dd9a5	120	85	205	Changed by admin	2026-02-13 07:07:32.091	780972375394091009	\N	\N	\N	\N
597e42f4-8cbf-4bfe-8103-d8c7964c4676	120	85	205	Changed by admin	2026-02-13 07:07:32.108	634021280529645569	\N	\N	\N	\N
99a0f3fc-fcdb-4cff-aaee-b9b5710b8090	120	-223	-103	Changed by admin	2026-02-13 07:07:32.123	658305794038825030	\N	\N	\N	\N
5f679a3a-1c6e-4f98-9d1c-f4c19c371384	120	0	120	Changed by admin	2026-02-13 07:07:32.137	713930443027644477	\N	\N	\N	\N
ffa37d52-497a-4d01-9d5a-1f596b250d47	-10	-103	-113	Play on server Ariuan's Server	2026-02-13 10:36:09.315	658305794038825030	1	\N	\N	\N
eff5c8db-d388-4c49-8ebd-0fbd2ca89e8d	-10	-113	-123	Play on server Ariuan's Server	2026-02-13 10:36:31.503	658305794038825030	1	\N	\N	\N
5d36f36b-2dd7-4c11-9480-2df215c4980c	173	-123	50	Set by admin	2026-02-13 11:04:53.348	658305794038825030	\N	\N	\N	\N
e5963063-cbb6-42d5-bff8-2f71acbb57fb	-3	50	47	Check credit of user wingwing	2026-02-13 11:05:20.787	658305794038825030	\N	\N	\N	\N
2011b954-c84a-4e9e-8c94-2964d9e13321	-3	47	44	Check credit of user A蛋黃	2026-02-13 11:05:48.489	658305794038825030	\N	\N	\N	\N
b5d49cf3-fe37-4dc3-8090-e05d340ab4e8	-30	44	14	New Start Server Poll	2026-02-13 15:29:58.581	658305794038825030	1	\N	\N	\N
960e6d3e-0c7b-49eb-88f6-d7e0493de4e8	-15	14	-1	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-13 15:30:17.847	658305794038825030	1	\N	\N	\N
e08bba48-6812-4e96-8647-b5f98def077d	30	-1	29	New Approval Poll Refund	2026-02-13 16:02:36.566	658305794038825030	1	\N	\N	\N
19556570-c7fb-45cc-a073-b68d4cea2fdb	30	-1	29	New Approval Poll Refund	2026-02-13 16:02:36.569	658305794038825030	1	\N	\N	\N
4a623d97-83d9-472b-9ff4-e0a998bcdb64	15	29	44	Approval Reaction Refund	2026-02-13 16:02:37.065	658305794038825030	1	\N	\N	\N
9f2568b1-732d-4086-a362-82bb07a58bf1	15	44	59	Approval Reaction Refund	2026-02-13 16:02:37.509	658305794038825030	1	\N	\N	\N
44f38f32-9d4a-4549-aba5-9bc2fa97885c	30	59	89	New Approval Poll Refund	2026-02-13 16:02:38.555	658305794038825030	1	\N	\N	\N
37d49063-48ee-46c1-9f69-52159700f225	15	89	104	Approval Reaction Refund	2026-02-13 16:02:38.937	658305794038825030	1	\N	\N	\N
0f668e2c-268f-4baf-8832-d4fe4430faa7	30	104	134	New Approval Poll Refund	2026-02-13 16:02:39.109	658305794038825030	1	\N	\N	\N
2e182b06-72ed-4309-996f-3a92e9656946	15	134	149	Approval Reaction Refund	2026-02-13 16:02:39.85	658305794038825030	1	\N	\N	\N
a7cbefc3-7306-4b97-ab7c-7b6bb72ce1c1	30	149	179	New Approval Poll Refund	2026-02-13 16:02:40.12	658305794038825030	1	\N	\N	\N
09d296d1-fb62-4727-a46a-540eab0d28d4	15	179	194	Approval Reaction Refund	2026-02-13 16:02:45.049	658305794038825030	1	\N	\N	\N
614006b1-5407-493d-861a-2fd9926500a0	30	194	224	New Approval Poll Refund	2026-02-13 16:02:45.381	658305794038825030	1	\N	\N	\N
44f7cccb-534d-49bb-bfba-77b70064dc22	15	224	239	Approval Reaction Refund	2026-02-13 16:02:45.796	658305794038825030	1	\N	\N	\N
4ed18411-b2c1-47c6-8754-c72272d62419	-10	239	229	Play on server Ariuan's Server	2026-02-13 16:06:20.984	658305794038825030	1	\N	\N	\N
34c4fc72-52ed-40df-a80b-796ff768fd76	-10	229	219	Play on server Ariuan's Server	2026-02-13 16:27:10.972	658305794038825030	1	\N	\N	\N
872b3ccf-a047-4fd7-8c34-498ef5418c58	-10	219	209	Play on server Ariuan's Server	2026-02-13 16:35:48.26	658305794038825030	1	\N	\N	\N
d073e1e7-3d7c-426d-bb5a-145cbf1d3ae4	-10	209	199	Play on server Ariuan's Server	2026-02-13 16:35:58.31	658305794038825030	1	\N	\N	\N
8f1c5bc8-1bf0-47da-83c4-a99f5d1adedf	-10	199	189	Play on server Ariuan's Server	2026-02-13 16:56:48.338	658305794038825030	1	\N	\N	\N
2179cf1b-94ad-49ea-999c-19215259b9e2	-10	189	179	Play on server Ariuan's Server	2026-02-13 17:11:49.633	658305794038825030	1	\N	\N	\N
73c935f6-cf9f-4c00-aeef-ed0adcb2673a	-10	179	169	Play on server Ariuan's Server	2026-02-13 17:15:33.934	658305794038825030	1	\N	\N	\N
05458b9d-e3d4-4da4-888a-76df5d6211af	-10	205	195	Play on server Ariuan's Server	2026-02-13 17:21:02.93	780972375394091009	1	\N	\N	\N
af437412-1760-48cb-b0e9-7d83d842896e	-10	195	185	Play on server Ariuan's Server	2026-02-13 17:21:04.509	780972375394091009	1	\N	\N	\N
918d549d-e27b-4790-bef0-ac3f1a807e4e	-10	169	159	Play on server Ariuan's Server	2026-02-13 17:22:19.63	658305794038825030	1	\N	\N	\N
c0e6410c-e048-4215-895e-da4f9307c56c	-10	159	149	Play on server Ariuan's Server	2026-02-13 17:22:21.959	658305794038825030	1	\N	\N	\N
0291ca85-4789-40fa-b8b6-9167f38f583f	-10	185	175	Play on server Ariuan's Server	2026-02-13 17:23:44.068	780972375394091009	1	\N	\N	\N
807c5ef9-0f78-4fdd-869b-81212c572101	-10	149	139	Play on server Ariuan's Server	2026-02-13 17:25:24.176	658305794038825030	1	\N	\N	\N
2f2110cc-aace-449a-ba53-165ab130daa2	-10	139	129	Play on server Ariuan's Server	2026-02-13 17:32:39.64	658305794038825030	1	\N	\N	\N
a86bcb2e-4949-4d31-9175-29aea38a45b7	-10	129	119	Play on server Ariuan's Server	2026-02-13 17:35:45.983	658305794038825030	1	\N	\N	\N
9bc423be-9f01-4353-b1d2-b1b3ced737e7	-10	119	109	Play on server Ariuan's Server	2026-02-13 17:35:46.218	658305794038825030	1	\N	\N	\N
6b8e6a6c-e4ee-4bcf-b7d6-b961f0af50fd	-3	109	106	Check credit of user A蛋黃	2026-02-13 17:41:37.957	658305794038825030	\N	\N	\N	\N
d86f8314-a272-496c-a832-7f73258fd99f	-10	175	165	Play on server Ariuan's Server	2026-02-13 17:44:34.09	780972375394091009	1	\N	\N	\N
e1e1f04b-a89c-46d8-9e0f-6eee92848f81	-10	106	96	Play on server Ariuan's Server	2026-02-13 17:56:36.245	658305794038825030	1	\N	\N	\N
33b1a140-c840-4038-99e1-4affe19afd0f	-10	96	86	Play on server Ariuan's Server	2026-02-13 18:15:58.38	658305794038825030	1	\N	\N	\N
3c8fb025-e941-4e90-9d1e-194f816a0cff	-10	86	76	Play on server Ariuan's Server	2026-02-13 18:35:48.342	658305794038825030	1	\N	\N	\N
b003df78-68a2-4d8f-9201-d853e7d86c98	-10	76	66	Play on server Ariuan's Server	2026-02-13 18:37:00.869	658305794038825030	1	\N	\N	\N
80daf240-cedc-4853-8c36-0111335caf5a	-10	66	56	Play on server Ariuan's Server	2026-02-13 18:49:06.278	658305794038825030	1	\N	\N	\N
2fbd7380-21fd-4614-aeab-077fc77f222b	-3	56	53	Check credit of user A蛋黃	2026-02-13 18:49:30.811	658305794038825030	\N	\N	\N	\N
aa58b42c-3d9e-4968-b366-1c541814ce81	-10	53	43	Play on server Ariuan's Server	2026-02-13 18:51:28.717	658305794038825030	1	\N	\N	\N
7e35fce8-5bfb-4413-8d0e-84e2e22e583c	-10	43	33	Play on server Ariuan's Server	2026-02-13 18:51:38.035	658305794038825030	1	\N	\N	\N
5968f12b-9a5d-4f95-82fc-34973f8847be	-3	33	30	Check credit of user A蛋黃	2026-02-13 18:57:52.189	658305794038825030	\N	\N	\N	\N
1a3c219a-2740-40a9-bb3b-bf5b989b10a0	-10	30	20	Play on server Ariuan's Server	2026-02-14 04:42:45.531	658305794038825030	1	\N	\N	\N
706a4d07-f5ed-44f6-8f36-23e897afc662	-10	20	10	Play on server Ariuan's Server	2026-02-14 04:44:56.515	658305794038825030	1	\N	\N	\N
8989fb17-4582-482e-9263-099e6b1017bf	20	10	30	Daily Gift	2026-02-14 06:00:00.267	658305794038825030	\N	\N	\N	\N
92210435-d360-4548-b9c7-e82c9590c98a	-10	30	20	Play on server Ariuan's Server	2026-02-14 09:05:15.875	658305794038825030	1	\N	\N	\N
d97c464b-62a2-4a27-a07b-463bc28d737f	-10	20	10	Play on server Ariuan's Server	2026-02-14 09:26:05.92	658305794038825030	1	\N	\N	\N
c4b7f6da-e735-46fa-be83-505f9ebf1e7b	-10	10	0	Play on server Ariuan's Server	2026-02-14 09:36:01.288	658305794038825030	1	\N	\N	\N
d668582f-1499-4d36-8f05-f401b67a90a1	-10	0	-10	Play on server Ariuan's Server	2026-02-14 09:36:04.62	658305794038825030	1	\N	\N	\N
72524e27-fa77-4327-92ae-7477de9891b6	-10	-10	-20	Play on server Ariuan's Server	2026-02-14 09:44:44.85	658305794038825030	1	\N	\N	\N
587145e4-546f-47cf-b21c-e00bbc965f5a	20	-20	0	Daily Gift	2026-02-15 06:00:00.732	658305794038825030	\N	\N	\N	\N
ccc81685-38ba-4c0f-9768-f351c9b63e42	-10	0	-10	Play on server Ariuan's Server	2026-02-15 08:11:05.904	658305794038825030	1	\N	\N	\N
5e8bca53-e557-4b64-8300-da326265c3cc	-10	-10	-20	Play on server Ariuan's Server	2026-02-15 08:31:55.925	658305794038825030	1	\N	\N	\N
82d4f9fe-ce2f-4ed9-b960-c4963aba61f3	-10	-20	-30	Play on server Ariuan's Server	2026-02-15 08:35:50.71	658305794038825030	1	\N	\N	\N
57436bad-9fc6-41ae-b572-fde85446cd85	-10	-30	-40	Play on server Ariuan's Server	2026-02-15 08:36:21.311	658305794038825030	1	\N	\N	\N
3acf32eb-f93d-42d5-981f-a6989d9daa7e	-10	-40	-50	Play on server Ariuan's Server	2026-02-15 08:57:11.326	658305794038825030	1	\N	\N	\N
363d56d8-bfca-4d2d-86d6-e8cb3498cc29	-10	-50	-60	Play on server Ariuan's Server	2026-02-15 09:21:04.391	658305794038825030	1	\N	\N	\N
b97ade8c-67e4-43e1-a47d-c761925d2acd	-10	-60	-70	Play on server Ariuan's Server	2026-02-15 09:21:08.256	658305794038825030	1	\N	\N	\N
ba0af5eb-5edf-4118-8567-b85ed0a8d3f6	-10	-70	-80	Play on server Ariuan's Server	2026-02-15 09:35:51.075	658305794038825030	1	\N	\N	\N
2fdd3e58-e09c-4f99-9ca0-dcd3a681ca54	-10	-80	-90	Play on server Ariuan's Server	2026-02-15 09:35:54.616	658305794038825030	1	\N	\N	\N
ad48e19d-35d7-4489-9f2d-3e9b97188015	-10	-90	-100	Play on server Ariuan's Server	2026-02-15 09:56:44.663	658305794038825030	1	\N	\N	\N
f9b6020c-293b-44e3-9d90-00d389222151	-10	-100	-110	Play on server Ariuan's Server	2026-02-15 10:35:50.826	658305794038825030	1	\N	\N	\N
ade0a2aa-51a2-4983-a7da-dae248bfda28	-10	-110	-120	Play on server Ariuan's Server	2026-02-15 10:37:08.353	658305794038825030	1	\N	\N	\N
80a188ef-87fd-439c-b64a-606900a5a01e	-10	-120	-130	Play on server Ariuan's Server	2026-02-15 10:41:39.545	658305794038825030	1	\N	\N	\N
0a7bad79-bc91-44f6-a281-1724b42bda01	-10	-130	-140	Play on server Ariuan's Server	2026-02-15 15:28:05.043	658305794038825030	1	\N	\N	\N
3a6a848a-28dd-49f2-8781-d35c3fc634ff	-10	-140	-150	Play on server Ariuan's Server	2026-02-15 15:35:49.271	658305794038825030	1	\N	\N	\N
8f6e8d2d-e71c-418b-8ec9-f48fa79e23eb	-10	-150	-160	Play on server Ariuan's Server	2026-02-15 15:48:19.624	658305794038825030	1	\N	\N	\N
6640dacb-db00-4586-bea2-6c34c33f9583	-10	-160	-170	Play on server Ariuan's Server	2026-02-15 15:56:39.632	658305794038825030	1	\N	\N	\N
6b07e0c4-7c25-4f00-8ec3-03c214e08994	-10	-170	-180	Play on server Ariuan's Server	2026-02-15 16:09:09.615	658305794038825030	1	\N	\N	\N
03caa741-fa2e-4e45-a679-9baa22cbb58c	-10	-180	-190	Play on server Ariuan's Server	2026-02-15 16:17:29.613	658305794038825030	1	\N	\N	\N
2baf5008-8e43-4c88-9318-e9cf66ac1ac3	-10	-190	-200	Play on server Ariuan's Server	2026-02-15 16:29:59.646	658305794038825030	1	\N	\N	\N
7c7fb9db-19ec-4fd8-bcbc-cbf530e6a646	-10	-200	-210	Play on server Ariuan's Server	2026-02-15 16:36:03.172	658305794038825030	1	\N	\N	\N
9b111037-81b9-4d44-b79d-56c16bd047f7	-10	-210	-220	Play on server Ariuan's Server	2026-02-15 16:41:12.188	658305794038825030	1	\N	\N	\N
25155222-bfb9-4f44-96b1-839fa41d5a5d	-10	-220	-230	Play on server Ariuan's Server	2026-02-15 16:53:42.204	658305794038825030	1	\N	\N	\N
9a06de8c-6b67-4b40-beac-7ec4e2f88487	-10	-230	-240	Play on server Ariuan's Server	2026-02-15 16:57:52.201	658305794038825030	1	\N	\N	\N
09b03b43-6b5f-41b5-aa10-cb0327587dd7	-10	-240	-250	Play on server Ariuan's Server	2026-02-15 17:02:02.209	658305794038825030	1	\N	\N	\N
5aa51088-bf92-4726-81e1-d7f105f954db	-10	-250	-260	Play on server Ariuan's Server	2026-02-15 17:14:32.203	658305794038825030	1	\N	\N	\N
390f7aa7-97f8-49a0-a316-2949ec91b9e9	-10	-260	-270	Play on server Ariuan's Server	2026-02-15 17:18:42.213	658305794038825030	1	\N	\N	\N
4fbb97c1-5216-4de5-a1ae-be570dbe6471	-10	-270	-280	Play on server Ariuan's Server	2026-02-15 17:22:52.208	658305794038825030	1	\N	\N	\N
5bfd1ba7-9905-4873-9782-10dc7b7d728f	-10	-280	-290	Play on server Ariuan's Server	2026-02-15 17:35:22.221	658305794038825030	1	\N	\N	\N
5f3bcdb5-43e3-4531-9395-bf6b0f0654a8	-10	-290	-300	Play on server Ariuan's Server	2026-02-15 17:35:52.905	658305794038825030	1	\N	\N	\N
cbf3ee7a-f663-4b8f-820e-3222cd809ea1	-10	-300	-310	Play on server Ariuan's Server	2026-02-15 17:38:58.947	658305794038825030	1	\N	\N	\N
f4efe96e-bb84-4d22-9350-ebb16720c7d9	410	-310	100	Set by admin	2026-02-15 17:40:39.397	658305794038825030	\N	\N	\N	\N
b35dd78d-09d7-4c46-931b-2499081bfe27	-10	100	90	Play on server Ariuan's Server	2026-02-15 17:43:13.201	658305794038825030	1	\N	\N	\N
eb9cb2a6-84e7-40b0-8b27-15ed79768d25	-10	90	80	Play on server Ariuan's Server	2026-02-15 17:55:43.207	658305794038825030	1	\N	\N	\N
acecbf6f-9404-4017-b46f-cd6a3756f3b3	-10	80	70	Play on server Ariuan's Server	2026-02-15 17:59:53.216	658305794038825030	1	\N	\N	\N
47590933-7a2e-43c7-bbe7-e07e7c1044c5	-10	70	60	Play on server Ariuan's Server	2026-02-15 18:04:03.226	658305794038825030	1	\N	\N	\N
315a82d2-c2b1-49cd-b295-2b27b86eaa7f	-10	60	50	Play on server Ariuan's Server	2026-02-15 18:16:33.215	658305794038825030	1	\N	\N	\N
6e06dedd-48c0-4247-9a5c-2fd9b2285287	-10	50	40	Play on server Ariuan's Server	2026-02-15 18:20:43.213	658305794038825030	1	\N	\N	\N
edcb7160-03be-48da-a094-4903a3500df4	-10	40	30	Play on server Ariuan's Server	2026-02-15 18:24:53.224	658305794038825030	1	\N	\N	\N
f1b4b2c9-0128-4c80-a6ca-0f8331631a82	-10	30	20	Play on server Ariuan's Server	2026-02-15 18:36:03.264	658305794038825030	1	\N	\N	\N
6f203067-2fa9-4ec2-814e-8f4e6f30fafb	-10	20	10	Play on server Ariuan's Server	2026-02-15 18:36:45.6	658305794038825030	1	\N	\N	\N
06c8d25e-d80a-4ba6-b363-bc056cb753e7	-10	10	0	Play on server Ariuan's Server	2026-02-15 18:40:55.622	658305794038825030	1	\N	\N	\N
21314301-43f2-4ae1-9c19-f60c864c457f	-10	0	-10	Play on server Ariuan's Server	2026-02-15 18:45:05.627	658305794038825030	1	\N	\N	\N
1466e2f1-1f25-4db9-a926-d0869dd985a5	-10	-10	-20	Play on server Ariuan's Server	2026-02-15 18:57:35.619	658305794038825030	1	\N	\N	\N
a7acad3f-0cc3-4f6a-baa3-5de86bfd52c3	-10	-20	-30	Play on server Ariuan's Server	2026-02-15 19:01:45.623	658305794038825030	1	\N	\N	\N
a7cfc688-880b-4d90-abf1-0b3279712454	-10	-30	-40	Play on server Ariuan's Server	2026-02-15 19:05:55.622	658305794038825030	1	\N	\N	\N
1b5df680-9ee0-4ed4-a6f4-473b91d5c60e	-10	-40	-50	Play on server Ariuan's Server	2026-02-15 19:18:25.636	658305794038825030	1	\N	\N	\N
70f194af-a4f7-477c-bc66-294050dc11b2	-10	-50	-60	Play on server Ariuan's Server	2026-02-15 19:22:35.632	658305794038825030	1	\N	\N	\N
9302b69e-9d0d-4776-a794-6163acbf9876	-10	-60	-70	Play on server Ariuan's Server	2026-02-15 19:24:37.774	658305794038825030	1	\N	\N	\N
ad668c07-336b-4cb3-aaa4-f1844e45f35c	-10	-70	-80	Play on server Ariuan's Server	2026-02-15 19:28:47.428	658305794038825030	1	\N	\N	\N
54c5df5f-c53c-4623-afae-06a9970cecb0	-10	-80	-90	Play on server Ariuan's Server	2026-02-15 19:34:02.728	658305794038825030	1	\N	\N	\N
6c0acadd-a7c7-4679-9b1b-c42155dbfbbc	-10	-90	-100	Play on server Ariuan's Server	2026-02-15 19:35:46.693	658305794038825030	1	\N	\N	\N
eceee987-7ef1-448d-bc49-6e5d7e26eaa8	-10	-100	-110	Play on server Ariuan's Server	2026-02-15 19:39:56.935	658305794038825030	1	\N	\N	\N
cacee2a3-409c-4ca3-903f-f612f7c93852	-10	-110	-120	Play on server Ariuan's Server	2026-02-15 19:44:06.941	658305794038825030	1	\N	\N	\N
e1ae10fc-6ed3-41b7-8562-e1c39cd60586	-10	-120	-130	Play on server Ariuan's Server	2026-02-15 19:48:16.943	658305794038825030	1	\N	\N	\N
8864161b-0b9d-4b74-bc4e-a918c00b58a0	-10	-130	-140	Play on server Ariuan's Server	2026-02-15 19:52:26.967	658305794038825030	1	\N	\N	\N
d8a5c9cc-130c-4071-941f-2c30f3d45e9f	-10	-140	-150	Play on server Ariuan's Server	2026-02-15 19:56:36.945	658305794038825030	1	\N	\N	\N
0c2c930e-c86b-47f7-b7fe-36d4ffb548e6	-10	-150	-160	Play on server Ariuan's Server	2026-02-15 20:00:46.941	658305794038825030	1	\N	\N	\N
ec17b6b9-2d82-4a40-816b-50d1215868ab	-10	-160	-170	Play on server Ariuan's Server	2026-02-15 20:02:06.084	658305794038825030	1	\N	\N	\N
1c00f44a-fee0-464c-8429-9b334e667de8	20	-170	-150	Daily Gift	2026-02-16 06:00:00.386	658305794038825030	\N	\N	\N	\N
90ec4825-4c5a-4ed9-b92b-1faa0b0e1647	-10	-150	-160	Play on server Ariuan's Server	2026-02-16 06:26:05.89	658305794038825030	1	\N	\N	\N
241239a3-01bf-4653-b5b8-abe1c0a4234a	-10	-160	-170	Play on server Ariuan's Server	2026-02-16 06:35:52.448	658305794038825030	1	\N	\N	\N
2c49ec8f-926a-48cc-91e3-98f36e54d974	-10	-170	-180	Play on server Ariuan's Server	2026-02-16 06:48:22.751	658305794038825030	1	\N	\N	\N
9d79de44-7943-49fb-b982-246b476b7a2d	-10	-180	-190	Play on server Ariuan's Server	2026-02-16 06:56:42.747	658305794038825030	1	\N	\N	\N
0af4463e-c3ee-47e0-9e43-91292e6d09a9	-10	-190	-200	Play on server Ariuan's Server	2026-02-16 07:09:12.757	658305794038825030	1	\N	\N	\N
7f2db2db-d2a7-4be0-a26d-843e3cb8449c	-10	-200	-210	Play on server Ariuan's Server	2026-02-16 07:17:32.75	658305794038825030	1	\N	\N	\N
f6025816-1191-4067-8315-f05bd50d77c2	-10	-210	-220	Play on server Ariuan's Server	2026-02-16 07:30:02.761	658305794038825030	1	\N	\N	\N
1dd32669-cb7a-4b4e-be64-3c45c386d717	-10	-220	-230	Play on server Ariuan's Server	2026-02-16 07:35:52.1	658305794038825030	1	\N	\N	\N
4539533f-675a-4fad-89e3-5fbec6af19ab	-10	-230	-240	Play on server Ariuan's Server	2026-02-16 07:40:19.672	658305794038825030	1	\N	\N	\N
a3bd8bb6-d8fe-4f38-b74e-ea10a9f2c3f3	-10	-240	-250	Play on server Ariuan's Server	2026-02-16 07:52:49.67	658305794038825030	1	\N	\N	\N
6ed541a4-92fa-4670-a6cb-2ac145f4b9f7	-10	-250	-260	Play on server Ariuan's Server	2026-02-16 07:56:59.674	658305794038825030	1	\N	\N	\N
8092099f-a2c7-4f4a-ac0f-cb48fddcb396	-10	-260	-270	Play on server Ariuan's Server	2026-02-16 08:01:09.67	658305794038825030	1	\N	\N	\N
56a0cb6e-4faf-4426-9d04-42c5cfaa3f41	-10	-270	-280	Play on server Ariuan's Server	2026-02-16 08:13:39.674	658305794038825030	1	\N	\N	\N
78270313-64f8-4290-a244-f6ac33a27737	-10	-280	-290	Play on server Ariuan's Server	2026-02-16 08:17:49.685	658305794038825030	1	\N	\N	\N
ca45a578-abbe-4d4a-b992-2c9276cad8a9	-10	-290	-300	Play on server Ariuan's Server	2026-02-16 08:21:59.653	658305794038825030	1	\N	\N	\N
aedb3f29-38b6-4097-b341-a5cbfdad18a2	-10	-300	-310	Play on server Ariuan's Server	2026-02-16 08:34:29.679	658305794038825030	1	\N	\N	\N
0c49f5f3-d978-4c50-9afc-1b832f8d1869	-10	-310	-320	Play on server Ariuan's Server	2026-02-16 08:35:52.376	658305794038825030	1	\N	\N	\N
85629ddb-1a56-455c-a1de-e4b89ba232ee	-10	-320	-330	Play on server Ariuan's Server	2026-02-16 08:40:09.332	658305794038825030	1	\N	\N	\N
c0d9e849-7e75-4c4a-889f-c7ee27efdeef	-10	-330	-340	Play on server Ariuan's Server	2026-02-16 08:44:19.336	658305794038825030	1	\N	\N	\N
acdb3f8c-21f0-4b98-bf54-97cd6a67dfe3	-10	-340	-350	Play on server Ariuan's Server	2026-02-16 08:56:49.336	658305794038825030	1	\N	\N	\N
a737c9af-8aa3-4add-8d9f-45020da8bdb3	-10	-350	-360	Play on server Ariuan's Server	2026-02-16 09:00:59.336	658305794038825030	1	\N	\N	\N
dcaa4c61-8d5e-4b81-9e2a-a58504b2ddfa	-10	-360	-370	Play on server Ariuan's Server	2026-02-16 09:05:09.349	658305794038825030	1	\N	\N	\N
234ed46c-9478-420f-bf0b-a7a8f012608c	-10	-370	-380	Play on server Ariuan's Server	2026-02-16 09:17:39.341	658305794038825030	1	\N	\N	\N
fe8df4ef-a440-4853-a6a5-7ce07f7fc2bc	-10	165	155	Play on server Ariuan's Server	2026-02-16 09:20:37.432	780972375394091009	1	\N	\N	\N
5e37c5e0-3313-433c-b02f-86fc881d8ed4	-10	-380	-390	Play on server Ariuan's Server	2026-02-16 09:21:41.929	658305794038825030	1	\N	\N	\N
984f2322-6db6-44c6-b891-aa6fcc0b3ff7	-10	-390	-400	Play on server Ariuan's Server	2026-02-16 09:28:34.959	658305794038825030	1	\N	\N	\N
8fd02add-48dc-4905-b121-7fcb35766b52	-10	-400	-410	Play on server Ariuan's Server	2026-02-16 09:35:47.745	658305794038825030	1	\N	\N	\N
7533f9ed-b88c-4fd3-a496-47aae2981d59	-10	-410	-420	Play on server Ariuan's Server	2026-02-16 09:39:58.147	658305794038825030	1	\N	\N	\N
2f244e28-473f-4b28-bcc9-cd334c22d575	-10	155	145	Play on server Ariuan's Server	2026-02-16 09:41:27.449	780972375394091009	1	\N	\N	\N
b6d2fe9f-81f2-4860-ad4c-52445d550dab	-10	-420	-430	Play on server Ariuan's Server	2026-02-16 09:43:21.539	658305794038825030	1	\N	\N	\N
843f141c-f3e0-4d10-805e-0db71d27fbdd	-3	-430	-433	Check credit of user A蛋黃	2026-02-16 09:43:47.353	658305794038825030	\N	\N	\N	\N
6fe1d046-609a-42a7-8eba-2ffa8ee45285	-10	145	135	Play on server Ariuan's Server	2026-02-16 10:02:17.452	780972375394091009	1	\N	\N	\N
568e9a0d-1ae7-471c-8753-a17e3e26d675	-3	-433	-436	Check credit of user A蛋黃	2026-02-16 10:04:11.966	658305794038825030	\N	\N	\N	\N
6121cb9b-cfdf-4429-a82c-47252afb220e	-10	135	125	Play on server Ariuan's Server	2026-02-16 10:16:36.399	780972375394091009	1	\N	\N	\N
5e852f44-82a0-4ea5-94f9-ec00af6dac5c	-3	-436	-439	Check credit of user A蛋黃	2026-02-16 10:33:17.039	658305794038825030	\N	\N	\N	\N
cf80519b-3fb9-4317-830f-eec5cfda648b	-10	-439	-449	Play on server Ariuan's Server	2026-02-16 13:01:46.413	658305794038825030	1	\N	\N	\N
4a399844-274e-410f-b810-6d8b1036439b	-10	-449	-459	Play on server Ariuan's Server	2026-02-16 13:04:44.616	658305794038825030	1	\N	\N	\N
8d1f9849-92b3-4492-a2b0-0caeb38c1423	-10	-459	-469	Play on server Ariuan's Server	2026-02-16 13:46:41.842	658305794038825030	1	\N	\N	\N
cb210418-032d-46ce-81ff-5e0186a25516	-10	-469	-479	Play on server Ariuan's Server	2026-02-16 13:51:36.175	658305794038825030	1	\N	\N	\N
c0c9fcc7-c179-4186-8b85-610a1f781347	20	-479	-459	Daily Gift	2026-02-17 06:00:00.843	658305794038825030	\N	\N	\N	\N
92f830ba-dff0-4f26-98e4-0bf6dd9ea559	-30	-459	-489	New Start Server Poll	2026-02-17 07:52:14.46	658305794038825030	1	\N	\N	\N
fe8d3255-9fb4-47ec-8a7b-3a5cd847d5c9	-15	-489	-504	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-17 07:52:25.351	658305794038825030	1	\N	\N	\N
3f072ffa-1ba2-4929-8e46-b21907cfb881	-15	125	110	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-17 07:59:12.152	780972375394091009	1	\N	\N	\N
a4f1e176-7783-476a-8a5f-ea8195e930e0	-15	-504	-519	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-17 07:59:22.669	658305794038825030	1	\N	\N	\N
a06b1073-1c7b-4bc1-bbe5-b792ef1514c1	-10	110	100	Play on server Ariuan's Server	2026-02-17 08:19:05.466	780972375394091009	1	\N	\N	\N
90d59a6f-de74-4c14-ba53-0a1185025586	-10	100	90	Play on server Ariuan's Server	2026-02-17 08:39:55.487	780972375394091009	1	\N	\N	\N
9f6cc999-5cb4-4321-acfc-b0d8c80a0931	-10	90	80	Play on server Ariuan's Server	2026-02-17 09:00:45.492	780972375394091009	1	\N	\N	\N
d520ce57-e8ec-4f8b-8110-ef7a277e3b02	-20	-519	-539	New Run Command Poll	2026-02-17 09:16:48.682	658305794038825030	1	\N	\N	\N
a1ee2e8e-90c0-4caf-ab99-b4e617a03431	-20	-539	-559	Approval Poll Reaction: xp 20L Snow_Flakes0724	2026-02-17 09:17:00.374	658305794038825030	1	\N	\N	\N
1d19df11-d781-42bf-b2bf-1660b97ff556	-10	80	70	Play on server Ariuan's Server	2026-02-17 09:21:35.496	780972375394091009	1	\N	\N	\N
24bdfa7d-2677-4214-a1fb-2bd43fdfbb59	-10	-559	-569	Play on server Ariuan's Server	2026-02-17 09:24:27.037	658305794038825030	1	\N	\N	\N
54e5c6dd-3c72-4212-8540-a1dd996a760d	-10	-569	-579	Play on server Ariuan's Server	2026-02-17 09:28:58.04	658305794038825030	1	\N	\N	\N
9a3b3f1f-b0d9-45b0-a5d6-7f01ac7c2320	-10	70	60	Play on server Ariuan's Server	2026-02-17 09:42:25.515	780972375394091009	1	\N	\N	\N
a9b8c9b9-f67b-48d3-9b95-218c804b0562	-10	60	50	Play on server Ariuan's Server	2026-02-17 09:56:24.461	780972375394091009	1	\N	\N	\N
a3d6b1a0-57bd-4072-b1b4-eeacf522bb74	88	435	523	Changed by admin	2026-02-17 12:10:40.48	709605543358234674	\N	\N	\N	\N
db686d69-4b47-4d8f-bba4-5b1e48907793	88	1011	1099	Changed by admin	2026-02-17 12:10:40.513	678185861275189258	\N	\N	\N	\N
bef38be0-4b67-4b92-aeb8-e37cd3381761	88	0	88	Changed by admin	2026-02-17 12:10:40.522	1372227913923039312	\N	\N	\N	\N
f0be4396-03d7-4cb4-85af-24c088b6308a	88	65	153	Changed by admin	2026-02-17 12:10:40.529	950063797358428260	\N	\N	\N	\N
d8ea7806-4af4-487e-bd96-407261328efb	88	461	549	Changed by admin	2026-02-17 12:10:40.535	844193954756689921	\N	\N	\N	\N
bd48ea0e-f0b3-4d50-bf8d-c40bc0236306	88	200	288	Changed by admin	2026-02-17 12:10:40.539	804333943775559680	\N	\N	\N	\N
deeccf42-bab7-45df-baf1-5f9a359f7ea9	88	200	288	Changed by admin	2026-02-17 12:10:40.543	841246467536584704	\N	\N	\N	\N
191eae85-4a7a-4f4d-8727-217be9d33e08	88	0	88	Changed by admin	2026-02-17 12:10:40.546	825752488388329514	\N	\N	\N	\N
2d94bb42-0e8a-4b77-88f6-0c22c2648caa	88	195	283	Changed by admin	2026-02-17 12:10:40.55	645919565758464010	\N	\N	\N	\N
755d29f1-ff62-44c0-8767-321470662bb0	88	50	138	Changed by admin	2026-02-17 12:10:40.556	780972375394091009	\N	\N	\N	\N
96229039-d190-42f0-9121-d240d5be7bbb	88	205	293	Changed by admin	2026-02-17 12:10:40.56	634021280529645569	\N	\N	\N	\N
b9649542-3f98-4780-ba4a-a8b43a322727	88	-579	-491	Changed by admin	2026-02-17 12:10:40.567	658305794038825030	\N	\N	\N	\N
de7f85d5-1f15-47ff-a2dc-478466d11cd4	88	0	88	Changed by admin	2026-02-17 12:10:40.575	713930443027644477	\N	\N	\N	\N
97f60b85-c286-4f03-8916-003ece47c950	-4	-491	-495	Play on server Ariuan's Server	2026-02-17 12:11:28.185	658305794038825030	1	\N	\N	\N
cd5efe61-722c-4a37-a1e7-d84b371e5fd3	-4	-495	-499	Play on server Ariuan's Server	2026-02-17 12:32:18.168	658305794038825030	1	\N	\N	\N
9a960805-248f-4398-bdf1-94c6ed9176d1	-6	-499	-505	Play on server Ariuan's Server	2026-02-17 12:53:08.157	658305794038825030	1	\N	\N	\N
37ef32ed-77af-41ad-bba0-cebe945bc29b	-6	-505	-511	Play on server Ariuan's Server	2026-02-17 13:13:58.155	658305794038825030	1	\N	\N	\N
364fa597-375e-4f07-a255-68570bd96bd4	-3	-511	-514	Check credit of user wingwing	2026-02-17 13:21:29.251	658305794038825030	\N	\N	\N	\N
d157f96f-1573-454e-a4fb-2b450457a521	-6	-514	-520	Play on server Ariuan's Server	2026-02-17 13:34:48.163	658305794038825030	1	\N	\N	\N
e303a888-a592-4bd3-b5b7-03e380ae9458	-6	-520	-526	Play on server Ariuan's Server	2026-02-17 13:55:38.197	658305794038825030	1	\N	\N	\N
f7984579-fe8e-4f6b-9201-a6023e08d9fb	-6	-526	-532	Play on server Ariuan's Server	2026-02-17 14:04:06.446	658305794038825030	1	\N	\N	\N
14f3ff81-1fb1-4f7d-978c-6583054b9a3c	-18	-532	-550	New Start Server Poll (Using Ticket: Happy Holiday!, saved 12 credits)	2026-02-17 16:00:10.26	658305794038825030	1	\N	\N	\N
d66ed4cd-c45b-4546-bf17-1939a2128009	-15	-550	-565	Approval Poll Reaction: Start Server at Ariuan's Server	2026-02-17 16:00:20.188	658305794038825030	1	\N	\N	\N
cb1635d0-8eb0-4d33-b6fe-ae85582ad9e1	-6	-565	-571	Play on server Ariuan's Server	2026-02-18 03:57:29.572	658305794038825030	1	\N	\N	\N
7e7d9811-03a6-4d74-8b11-3d571e8dc8c9	-6	-571	-577	Play on server Ariuan's Server	2026-02-18 03:58:10.992	658305794038825030	1	\N	\N	\N
04a9d298-4de4-4cbc-b67b-cf8bf81b5cfe	-6	-577	-583	Play on server Ariuan's Server	2026-02-18 03:59:23.136	658305794038825030	1	\N	\N	\N
8993ff0f-6826-46c1-94b9-aca3c56abc20	20	-583	-563	Daily Gift	2026-02-18 06:00:00.346	658305794038825030	\N	\N	\N	\N
c1cd971a-0d41-4a78-8a3c-a67ea3ff2e6e	-3	-563	-566	Checking tickets for user wingwing8709	2026-02-18 15:06:37.692	658305794038825030	\N	\N	\N	\N
fced943b-0fca-452d-a83a-ff8b324ff7be	-18	-566	-584	New Start Server Poll (Using Ticket: Happy Holiday!, saved 12 credits)	2026-02-18 15:16:23.43	658305794038825030	1	\N	\N	\N
6c7a29ba-5d35-4d80-9ce3-340e0ff4e2fb	-6	-584	-590	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket: Test Ticket, saved 9 credits)	2026-02-18 15:17:37.018	658305794038825030	1	\N	\N	\N
a60e8679-f492-4d44-b253-70fed68ed253	-6	-590	-596	Play on server Ariuan's Server	2026-02-18 15:18:51.837	658305794038825030	1	\N	\N	\N
23d9431c-54b6-4a09-8098-7fbdacb25384	20	-596	-576	Daily Gift	2026-02-19 06:00:00.368	658305794038825030	\N	\N	\N	\N
1be13304-318b-448d-babc-a5fd4d8d7ef6	-6	-576	-582	Play on server Ariuan's Server	2026-02-19 16:19:56.792	658305794038825030	1	\N	\N	\N
e3430a10-f079-4791-b25e-fe4935a60789	-6	-582	-588	Play on server Ariuan's Server	2026-02-19 16:40:46.814	658305794038825030	1	\N	\N	\N
399ebdc3-ae1b-4f30-971e-e90578e3a311	-6	-588	-594	Play on server Ariuan's Server	2026-02-19 17:01:36.814	658305794038825030	1	\N	\N	\N
f7dbdb03-0d53-4bde-9bda-c5e22994efba	-6	-594	-600	Play on server Ariuan's Server	2026-02-19 17:22:26.832	658305794038825030	1	\N	\N	\N
5edffc7b-c23a-434b-927c-f6283b408de9	-6	-600	-606	Play on server Ariuan's Server	2026-02-19 17:43:16.83	658305794038825030	1	\N	\N	\N
8e035fe1-cefe-40e2-ad70-365591e7330f	-6	-606	-612	Play on server Ariuan's Server	2026-02-19 18:04:06.847	658305794038825030	1	\N	\N	\N
24fac893-9575-4605-b1e5-45c11e870184	-6	-612	-618	Play on server Ariuan's Server	2026-02-19 18:19:36.023	658305794038825030	1	\N	\N	\N
fa2822d1-a3de-4f19-88e6-97ab09552760	20	-618	-598	Daily Gift	2026-02-20 06:00:00.45	658305794038825030	\N	\N	\N	\N
7468105f-c3e2-4f24-81af-e5ea5c4acd4a	-20	-598	-618	List Files (root)	2026-02-20 08:36:25.597	658305794038825030	2	\N	\N	\N
1b52b287-aef8-4f70-b5a8-58690a5618d6	-20	-618	-638	List Files (root)	2026-02-20 08:41:05.476	658305794038825030	1	\N	\N	\N
791abf9e-8dd4-4570-9ab3-1e4f3260f38f	-30	-638	-668	View File world/uid.dat	2026-02-20 08:41:44.532	658305794038825030	1	\N	\N	\N
23941937-ea51-4b8d-bfaa-f82e83e092db	-70	-668	-738	Upload Custom Mod to Server	2026-02-20 09:06:14.126	658305794038825030	1	\N	\N	\N
fca74836-d1ed-4016-a08b-f8da9e63a34f	-20	-738	-758	List Files (root)	2026-02-20 09:50:07.715	658305794038825030	1	\N	\N	\N
ded288f0-1017-4e4a-b663-8310d170d207	-120	-758	-878	Edit File world/level.dat	2026-02-20 09:50:39.516	658305794038825030	1	\N	\N	\N
d689cfcd-b354-4eda-8980-1050aca21e42	-120	-878	-998	Edit File world/level.dat	2026-02-20 10:09:19.365	658305794038825030	1	\N	\N	\N
c0451929-4202-41cd-a429-59c716381f73	-120	-998	-1118	Edit File world/level.dat	2026-02-20 10:12:12.277	658305794038825030	1	\N	\N	\N
4a1b8603-fa8a-42c8-8538-605bcf19f2cf	-120	-1118	-1238	Edit File world/level.dat	2026-02-20 10:14:38.055	658305794038825030	1	\N	\N	\N
e7bed437-d8b8-4061-9e35-7b32c34243c8	-120	-1238	-1358	Edit File world/level.dat	2026-02-20 10:24:40.049	658305794038825030	1	\N	\N	\N
b982df76-58b8-4643-ab47-093c223dcff6	-120	-1358	-1478	Edit File world/level.dat	2026-02-20 10:25:48.017	658305794038825030	1	\N	\N	\N
a5393003-f16a-4ba9-a12f-f3ed88288ad2	-120	-1478	-1598	Edit File world/level.dat	2026-02-20 10:27:45.013	658305794038825030	1	\N	\N	\N
f77c5dc1-e0f9-4cc0-ad1d-2d5a987794cc	-120	-1598	-1718	Edit File world/level.dat	2026-02-20 10:32:58.337	658305794038825030	1	\N	\N	\N
73dd1143-da01-4c84-a7e2-e795e1612fb0	-120	-1718	-1838	Edit File world/level.dat	2026-02-20 10:47:26.977	658305794038825030	1	\N	\N	\N
34ea1e4d-d65e-4444-9c1a-5b54ed2589ed	-120	-1838	-1958	Edit File whitelist.json	2026-02-20 10:51:59.333	658305794038825030	1	\N	\N	\N
190e7fb8-3751-4de2-bf92-f199e1408ab6	-120	-1958	-2078	Edit File whitelist.json	2026-02-20 11:03:13.376	658305794038825030	1	\N	\N	\N
1c22f5ba-8be8-4566-b984-8dac0d8f532f	-120	-2078	-2198	Edit File whitelist.json	2026-02-20 11:13:18.016	658305794038825030	1	\N	\N	\N
ae73d65a-84fa-42e4-8a25-1db69603977f	-120	-2198	-2318	Edit File world/level.dat	2026-02-20 11:13:35.336	658305794038825030	1	\N	\N	\N
40b9a209-f8d0-45ec-aa1c-e08515a955a6	-120	-2318	-2438	Edit File world/level.dat	2026-02-20 11:18:22.572	658305794038825030	1	\N	\N	\N
f825593c-282f-491e-959b-75fd16aabbf9	-120	-2438	-2558	Edit File world/level.dat	2026-02-20 11:19:34.994	658305794038825030	1	\N	\N	\N
aa4a4aaf-d49f-462c-957d-8c067721bc73	-120	-2558	-2678	Edit File world/level.dat	2026-02-20 11:20:57.437	658305794038825030	1	\N	\N	\N
6d81685d-3ae7-46b1-945d-970b710413b2	-120	-2678	-2798	Edit File world/level.dat	2026-02-20 11:22:22.744	658305794038825030	1	\N	\N	\N
858366b7-8392-40ee-a971-f12266be7a40	-120	-2798	-2918	Edit File world/level.dat	2026-02-20 11:38:58.068	658305794038825030	1	\N	\N	\N
1af648ba-20e6-45f0-9d1c-1d66e2c7d195	-120	-2918	-3038	Edit File world/level.dat	2026-02-20 11:41:02.162	658305794038825030	1	\N	\N	\N
6a743129-594b-4ee5-8467-86599822d5ba	-120	-3038	-3158	Edit File world/level.dat_old	2026-02-20 11:49:08.589	658305794038825030	1	\N	\N	\N
22183462-6bbe-40d2-a726-f7856d894f46	-120	-3158	-3278	Edit File world/level.dat_old	2026-02-20 11:51:44.552	658305794038825030	1	\N	\N	\N
c222b0ff-f2f3-4f46-a6fe-ee65b17138b9	-120	-3278	-3398	Edit File world/level.dat_old	2026-02-20 13:14:27.518	658305794038825030	1	\N	\N	\N
e68d228e-d596-4c88-97b9-7de11ff71478	-30	-3398	-3428	View File world/level.dat_old	2026-02-20 13:30:58.593	658305794038825030	1	\N	\N	\N
1fd8073e-28d6-41d0-b666-80de9f35a4a4	-30	-3428	-3458	View File world/level.dat_old	2026-02-20 13:42:16.128	658305794038825030	1	\N	\N	\N
f36517e7-7a03-453b-9c35-90dcd0de8560	-30	-3458	-3488	View File world/level.dat_old	2026-02-20 13:44:08.744	658305794038825030	1	\N	\N	\N
7fe7547b-73df-4244-bdfb-8e83cb37875e	-30	-3488	-3518	View File world/level.dat_old	2026-02-20 13:45:49.95	658305794038825030	1	\N	\N	\N
fd0b2a00-e41a-4b38-b4f7-c6993953d29d	-120	1099	979	Edit File world/level.dat_old	2026-02-20 13:47:03.023	678185861275189258	1	\N	\N	\N
5b733a5b-e9ff-40c5-905c-15cc2babf5ab	-30	-3518	-3548	View File world/level.dat	2026-02-20 18:57:16.955	658305794038825030	1	\N	\N	\N
d7ef5982-6aca-4e98-aeb2-6effd9cc9ee5	-120	-3548	-3668	Edit File world/level.dat_old	2026-02-20 19:03:44.041	658305794038825030	1	\N	\N	\N
9b853890-f38a-4da2-b075-a01fd0aa0fe2	-120	-3668	-3788	Edit File file:world/level.dat_old	2026-02-20 19:12:05.741	658305794038825030	1	\N	\N	\N
fcfea23a-ddd3-47ec-82f7-064d2d70a01d	120	-3788	-3668	Edit File Request Failed Refund	2026-02-20 19:12:08.12	658305794038825030	1	\N	\N	\N
f87608d8-e6dd-4a5c-9ccc-46f9e0af8e82	-120	-3668	-3788	Edit File world/level.dat_old	2026-02-20 19:12:29.162	658305794038825030	1	\N	\N	\N
8ecc4d4b-cd8d-4694-8379-fa26c3a5df4e	-120	-3788	-3908	Edit File world/level.dat_old	2026-02-20 19:15:46.696	658305794038825030	1	\N	\N	\N
05632383-66e9-4dd2-8ccc-c7bd3645e91e	-30	-3908	-3938	View File world/level.dat	2026-02-20 19:32:22.43	658305794038825030	1	\N	\N	\N
34cd71e1-f418-4930-bac0-ef4957964a06	-30	-3938	-3968	View File world/level.dat	2026-02-20 19:34:29.484	658305794038825030	1	\N	\N	\N
fb63e015-e6d8-426c-96e7-14cfc1f80fd3	-30	-3968	-3998	View File world/level.dat	2026-02-20 19:35:42.377	658305794038825030	1	\N	\N	\N
caf920c5-c3d1-49ce-b82c-93e17e5b229c	-30	-3998	-4028	View File world/level.dat	2026-02-21 04:28:12.213	658305794038825030	1	\N	\N	\N
d48f928c-3a02-4a82-b022-493f3c16cc1a	-30	-4028	-4058	View File world/level.dat	2026-02-21 04:48:36.828	658305794038825030	1	\N	\N	\N
f90ba4e0-c0b1-4b36-bcbb-c3900cec4908	-30	-4058	-4088	View File level.dat	2026-02-21 05:11:20.028	658305794038825030	1	\N	\N	\N
63088efd-1344-486c-9fca-0a29f4df3af1	-30	-4088	-4118	View File world/level.dat	2026-02-21 05:11:59.95	658305794038825030	1	\N	\N	\N
4a69d78e-7cba-41de-b9a4-486a1441a2b1	6118	-4118	2000	Set by admin	2026-02-21 05:27:08.469	658305794038825030	\N	\N	\N	\N
c9f08382-ad20-42ed-bfde-12bdf722bdbc	-30	2000	1970	View File world/level.dat	2026-02-21 06:33:24.806	658305794038825030	1	\N	\N	\N
6583989f-7101-4ec8-83f6-fa92f7e80b8e	-30	1970	1940	View File world/level.dat	2026-02-21 07:12:26.535	658305794038825030	1	\N	\N	\N
022f4092-031f-4a54-abee-288e02ace5cf	-30	1940	1910	View File world/level.dat	2026-02-21 07:13:55.562	658305794038825030	1	\N	\N	\N
808c7c7e-171e-4670-bf08-483f5f5580f6	-30	1910	1880	View File world/level.dat	2026-02-21 07:16:56.021	658305794038825030	1	\N	\N	\N
436156d4-8ad1-47ef-a083-4f4aaa56e019	-30	1880	1850	View File world/level.dat	2026-02-21 07:32:58.675	658305794038825030	1	\N	\N	\N
6851e35d-22a7-466e-a96b-93f4e5d0d1c7	-120	1850	1730	Edit File world/level.dat_old	2026-02-21 08:27:35.11	658305794038825030	1	\N	\N	\N
a6610c46-027b-4579-baa2-7bb79cb38d6d	-6	1730	1724	Play on server Ariuan's Server	2026-02-21 12:55:53.737	658305794038825030	1	\N	\N	\N
704c6062-62aa-4fd3-9dc8-ad42e869e6a2	-6	1724	1718	Play on server Ariuan's Server	2026-02-21 13:16:43.752	658305794038825030	1	\N	\N	\N
c87c24b0-d21c-49dc-ab93-3230e7abd6f4	-6	1718	1712	Play on server Ariuan's Server	2026-02-21 13:37:33.76	658305794038825030	1	\N	\N	\N
1e216cd9-4a71-4726-9c8a-5d28755e1218	-6	1712	1706	Play on server Ariuan's Server	2026-02-21 13:40:02.839	658305794038825030	1	\N	\N	\N
3facc1dc-43ac-4f92-ad96-f7b357c3b375	-6	1706	1700	Play on server Ariuan's Server	2026-02-21 13:48:12.69	658305794038825030	1	\N	\N	\N
d5093aa4-de26-4963-9627-71a3e9e4263d	-6	1700	1694	Play on server Ariuan's Server	2026-02-21 14:01:25.721	658305794038825030	1	\N	\N	\N
8c0bb87b-465e-45fc-b89d-a73b75d8fd26	-6	1694	1688	Play on server Ariuan's Server	2026-02-21 14:09:45.718	658305794038825030	1	\N	\N	\N
85303dce-e038-447c-9607-c5eac79a43a1	-6	1688	1682	Play on server Ariuan's Server	2026-02-21 14:22:15.729	658305794038825030	1	\N	\N	\N
adab93aa-02e9-4033-8299-98aa427f1417	-6	1682	1676	Play on server Ariuan's Server	2026-02-21 14:30:35.716	658305794038825030	1	\N	\N	\N
3e822a5d-227b-4eca-9c66-31ed6127a7fc	-6	1676	1670	Play on server Ariuan's Server	2026-02-21 14:43:05.722	658305794038825030	1	\N	\N	\N
85cea441-5717-48cc-91ee-64eb1db658f8	-6	1670	1664	Play on server Ariuan's Server	2026-02-21 14:51:25.725	658305794038825030	1	\N	\N	\N
18bcb723-f51e-4b14-a57e-970a23a403a7	-6	1664	1658	Play on server Ariuan's Server	2026-02-21 14:54:13.518	658305794038825030	1	\N	\N	\N
7fc7424d-3d25-4a24-856c-d7c5edb5e466	-6	1658	1652	Play on server Ariuan's Server	2026-02-21 15:30:26.974	658305794038825030	1	\N	\N	\N
3e44cdae-80ee-43bd-a45b-1b7f6866d654	-6	1652	1646	Play on server Ariuan's Server	2026-02-21 15:51:16.978	658305794038825030	1	\N	\N	\N
04c1bd21-4957-4005-96be-3ee881d6ec76	-6	1646	1640	Play on server Ariuan's Server	2026-02-21 16:12:06.974	658305794038825030	1	\N	\N	\N
03f27b11-2ae6-47c9-981f-c9df9a175b96	-6	1640	1634	Play on server Ariuan's Server	2026-02-21 16:32:56.991	658305794038825030	1	\N	\N	\N
792cdeea-19e3-4298-87a8-f4aae0c285aa	-6	1634	1628	Play on server Ariuan's Server	2026-02-21 16:53:46.99	658305794038825030	1	\N	\N	\N
87e4a4ee-5878-49b8-b713-eabf8cfa7310	-6	1628	1622	Play on server Ariuan's Server	2026-02-21 17:14:37.004	658305794038825030	1	\N	\N	\N
5b034dc9-0c42-4fcb-a1f7-25755550954f	-6	1622	1616	Play on server Ariuan's Server	2026-02-21 17:35:26.995	658305794038825030	1	\N	\N	\N
bf6412e6-b45f-455d-a607-69853a16fa87	-6	1616	1610	Play on server Ariuan's Server	2026-02-21 17:56:16.997	658305794038825030	1	\N	\N	\N
604c8ee3-12eb-41bc-badb-46eba2b9ea4d	-6	1610	1604	Play on server Ariuan's Server	2026-02-21 18:17:07.026	658305794038825030	1	\N	\N	\N
a6222f59-d4b2-4b07-9e52-59f7c9ed821e	-6	1604	1598	Play on server Ariuan's Server	2026-02-21 18:37:57.032	658305794038825030	1	\N	\N	\N
f9a2f0ca-3cee-4e3d-8166-933e205de71d	-6	1598	1592	Play on server Ariuan's Server	2026-02-21 18:58:47.023	658305794038825030	1	\N	\N	\N
603022de-148e-4c26-a850-df275242fc95	-6	1592	1586	Play on server Ariuan's Server	2026-02-21 19:19:37.037	658305794038825030	1	\N	\N	\N
22b46586-3491-402f-ab80-dbdcc5b98193	-6	1586	1580	Play on server Ariuan's Server	2026-02-21 19:21:38.677	658305794038825030	1	\N	\N	\N
0d66b383-c841-4d62-97ff-c8fd769f86dc	-120	1580	1460	Edit File world/level.dat_old	2026-02-22 06:56:23.408	658305794038825030	1	\N	\N	\N
7188d58d-0f9e-4f31-8936-89bae6fdb501	-120	1460	1340	Edit File world/level.dat_old	2026-02-22 07:11:49.88	658305794038825030	1	\N	\N	\N
9f27fa80-796b-400f-aafa-addf5da7ec70	-120	1340	1220	Edit File world/level.dat_old	2026-02-22 07:28:09.956	658305794038825030	1	\N	\N	\N
3b533137-722b-47fc-a16e-e812b554c2a5	-120	1220	1100	Edit File world/level.dat_old	2026-02-22 07:44:02.213	658305794038825030	1	\N	\N	\N
60d78683-8bf6-4cb9-925c-71b3e7fead6b	-120	1100	980	Edit File world/level.dat_old	2026-02-22 08:00:08.342	658305794038825030	1	\N	\N	\N
fc415c88-cfc8-4013-b689-e73bb2dacbf4	-30	980	950	View File world/level.dat	2026-02-22 08:18:04.134	658305794038825030	1	\N	\N	\N
7bc5906f-3a85-44c3-aaf9-e7a3e3274612	-120	950	830	Edit File hello.dat	2026-02-22 11:28:33.566	658305794038825030	1	\N	\N	\N
bac21484-5428-4457-9aa7-e2660ed83362	-120	830	710	Edit File hello.dat	2026-02-22 11:47:39.546	658305794038825030	1	\N	\N	\N
9d0426f5-aa94-4acb-b3b1-da3162b0f5a5	-120	710	590	Edit File hello.dat	2026-02-22 11:59:45.72	658305794038825030	1	\N	\N	\N
55054c7a-c229-4ba7-9d8e-b2a72cd1d2b5	-120	590	470	Edit File hello.dat	2026-02-22 12:17:51.962	658305794038825030	1	\N	\N	\N
d4e16ec7-1aaa-4c24-aa88-4df0a44d9624	-120	470	350	Edit File hello.dat	2026-02-22 12:47:17.347	658305794038825030	1	\N	\N	\N
91494884-fbda-4a53-aacd-819e10eb7add	-120	350	230	Edit File hello.dat	2026-02-22 13:05:34.698	658305794038825030	1	\N	\N	\N
3ed6dcec-b733-4f05-b2c6-c1379a77a310	-20	230	210	List Files (root)	2026-02-23 01:34:16.269	658305794038825030	1	\N	\N	\N
515a6976-2504-4d3f-a6ed-1759ec1ffe41	-30	210	180	View File world/level.dat	2026-02-23 01:35:03.593	658305794038825030	1	\N	\N	\N
c0c299c9-b08b-46a7-baed-8175fa762340	-6	180	174	Play on server Ariuan's Server	2026-02-23 02:20:07.463	658305794038825030	1	\N	\N	\N
9a690239-72dc-46b6-adf8-39e61099d713	-6	174	168	Play on server Ariuan's Server	2026-02-23 02:23:21.507	658305794038825030	1	\N	\N	\N
49bcc4b0-7785-4d57-b613-918b9e0c7fcd	-30	979	949	New Start Server Poll (Using Ticket(s): `Pay Less Play More`, saved 0 credits)	2026-02-23 13:57:34.044	678185861275189258	1	\N	\N	\N
db33c446-c11c-4ebf-a896-4775cd2a1b47	-9	949	940	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket(s): `Happy Holiday!`, saved 6 credits)	2026-02-23 13:57:47.303	678185861275189258	1	\N	\N	\N
38c23e92-1e3e-47e4-b2db-937645ecc25e	0	940	940	New Start Server Poll (Using Ticket(s): `Happy Holiday!`, `Celebrate Cobblemon by Ariuan!`, `Celebrate Cobblemon by Ariuan!`, `Celebrate Cobblemon by Ariuan!`, `Celebrate Cobblemon by Ariuan!`, `Celebrate Cobblemon by Ariuan!`, saved 30 credits)	2026-02-23 14:06:20.667	678185861275189258	1	\N	\N	\N
0357c153-0bb8-4f48-abd1-f82f7250335f	30	940	970	New Approval Poll Refund	2026-02-23 14:08:16.165	678185861275189258	1	\N	\N	\N
fa8277d9-8d4b-4805-9417-2b5e72ea46c6	30	940	970	New Approval Poll Refund	2026-02-23 14:08:16.172	678185861275189258	1	\N	\N	\N
406328fd-ba14-4eb3-acc1-f0198f9d1087	-120	970	850	Edit File plugins/BlueMap/core.conf	2026-02-24 10:56:24.538	678185861275189258	1	\N	\N	\N
15648262-dcc0-4723-be19-28d9fc212bc9	-6	168	162	Play on server Ariuan's Server	2026-02-24 13:30:15.9	658305794038825030	1	\N	\N	\N
371164f2-3e7a-4295-acea-d46b71fc38c4	-6	162	156	Play on server Ariuan's Server	2026-02-24 13:51:05.869	658305794038825030	1	\N	\N	\N
9bf6a74f-daf6-49b2-b3df-e80d9f7204a0	-6	156	150	Play on server Ariuan's Server	2026-02-24 14:11:55.888	658305794038825030	1	\N	\N	\N
1d66a739-eb17-4d6e-be4c-5db23c3ae05d	-6	150	144	Play on server Ariuan's Server	2026-02-24 14:32:45.892	658305794038825030	1	\N	\N	\N
91229c32-96d6-448a-be16-ac6cd017ba89	-6	144	138	Play on server Ariuan's Server	2026-02-24 14:53:35.888	658305794038825030	1	\N	\N	\N
89c1f655-aad6-4af2-82b2-b04e904b465c	-6	138	132	Play on server Ariuan's Server	2026-02-24 15:14:25.912	658305794038825030	1	\N	\N	\N
8f21848f-b34b-40e9-bf4c-8565d374c826	-6	132	126	Play on server Ariuan's Server	2026-02-24 15:35:15.906	658305794038825030	1	\N	\N	\N
a8511538-5ab0-41ec-8d8f-ca3485bdc323	-6	126	120	Play on server Ariuan's Server	2026-02-24 15:56:05.908	658305794038825030	1	\N	\N	\N
1e6cdb6c-1605-435e-9e10-2210f9431f35	-6	120	114	Play on server Ariuan's Server	2026-02-24 16:16:55.916	658305794038825030	1	\N	\N	\N
6ae42db1-1d83-4082-bcf7-fcce797f5a9e	-6	114	108	Play on server Ariuan's Server	2026-02-24 16:37:45.92	658305794038825030	1	\N	\N	\N
2667cd76-acca-4e42-965c-b56e23736163	-6	108	102	Play on server Ariuan's Server	2026-02-24 16:58:35.936	658305794038825030	1	\N	\N	\N
81099910-b69e-4f57-a928-d72356d7337b	-6	102	96	Play on server Ariuan's Server	2026-02-24 17:19:25.947	658305794038825030	1	\N	\N	\N
f93e0718-2b46-4acb-9364-a6620c37bb90	-6	96	90	Play on server Ariuan's Server	2026-02-24 17:21:10.717	658305794038825030	1	\N	\N	\N
2d8eda2c-1d2e-430b-8f6a-a265c019dcb3	-10	138	128	Steal tea geh slope guy	2026-02-27 05:05:04.538	780972375394091009	\N	\N	\N	\N
d0984a4e-a0db-4c33-8ea7-2756fecd6202	-6	90	84	Play on server Ariuan's Server	2026-02-28 07:27:05.148	658305794038825030	1	\N	\N	\N
efa7e54d-5a3b-4d53-b63c-dc8990d0579d	-6	84	78	Play on server Ariuan's Server	2026-02-28 07:30:13.716	658305794038825030	1	\N	\N	\N
7e9d301e-872a-4105-8205-eb1a8b5cf784	-6	78	72	Play on server Ariuan's Server	2026-02-28 07:30:31.656	658305794038825030	1	\N	\N	\N
7b58c4a6-e570-4101-9b37-7a2eb312c34a	-6	72	66	Play on server Ariuan's Server	2026-02-28 07:31:28.205	658305794038825030	1	\N	\N	\N
e9b4910a-071e-4971-b0c7-85dda536dcc3	20	66	86	Daily Gift	2026-03-01 06:00:02.363	658305794038825030	\N	\N	\N	\N
161c506d-7e09-4827-ae66-a6d7cbaae633	-6	86	80	Play on server Ariuan's Server	2026-04-16 10:31:44.344	658305794038825030	1	\N	\N	\N
cda4cdaf-62ce-4891-8e4b-94e40d7d71f1	-6	80	74	Play on server Ariuan's Server	2026-04-16 10:52:34.377	658305794038825030	1	\N	\N	\N
aee6577b-4143-4ede-80d6-73ba2ae02255	-6	74	68	Play on server Ariuan's Server	2026-04-16 11:13:24.396	658305794038825030	1	\N	\N	\N
48dfe578-b03c-42d2-8605-a2887ce7e837	-6	68	62	Play on server Ariuan's Server	2026-04-16 11:34:14.386	658305794038825030	1	\N	\N	\N
8f5485e4-a282-4e0d-9c60-f1c1a0328f7b	-6	62	56	Play on server Ariuan's Server	2026-04-16 12:08:03.764	658305794038825030	1	\N	\N	\N
8c2608a5-becb-4730-a546-94ae5929c460	-6	56	50	Play on server Ariuan's Server	2026-04-16 13:25:39.151	658305794038825030	1	\N	\N	\N
7baf790c-efb8-4c87-bcb3-e419fb6c5ecb	-6	50	44	Play on server Ariuan's Server	2026-04-16 13:32:01.66	658305794038825030	1	\N	\N	\N
093a0a04-61fa-4ad5-9322-b4b3c9eda8a8	-6	44	38	Play on server Ariuan's Server	2026-04-16 13:46:21.765	658305794038825030	1	\N	\N	\N
c098fe57-8b29-4b9d-a356-67f3c5fbbe6d	20	38	58	Daily Gift	2026-04-17 06:00:00.431	658305794038825030	\N	\N	\N	\N
6d57e456-3b67-45da-a485-60626d9aae7e	-6	58	52	Play on server Ariuan's Server	2026-04-17 06:19:15.732	658305794038825030	1	\N	\N	\N
513bf774-c9b6-44d1-9cd4-59b7eb32d03e	-6	52	46	Play on server Ariuan's Server	2026-04-17 06:40:05.754	658305794038825030	1	\N	\N	\N
052ca715-37e7-4a41-843b-ebd58b3cf17d	-6	46	40	Play on server Ariuan's Server	2026-04-17 06:42:54.635	658305794038825030	1	\N	\N	\N
104f5eed-cf21-4b35-a3ae-61818313cd7f	-6	40	34	Play on server Ariuan's Server	2026-04-17 06:50:34.294	658305794038825030	1	\N	\N	\N
49ec96a2-7dbd-41e9-b4fc-8b8564b03f0a	-6	34	28	Play on server Ariuan's Server	2026-04-17 07:03:06.82	658305794038825030	1	\N	\N	\N
6ce4a275-d4f0-4f9d-ba0c-32369ce61777	-6	28	22	Play on server Ariuan's Server	2026-04-17 07:10:36.244	658305794038825030	1	\N	\N	\N
feb9f3c2-e8ae-4ea4-a448-2a79a85745ba	20	22	42	Daily Gift	2026-04-18 06:00:00.93	658305794038825030	\N	\N	\N	\N
9cb74491-d77f-4b2c-ab3b-467c5c6fcadb	20	0	20	Daily Gift	2026-04-18 06:00:02.161	666239646711414787	\N	\N	\N	\N
71b6bbd2-cccc-4ff4-8312-fc136963f816	20	42	62	Daily Gift	2026-04-19 06:00:01.415	658305794038825030	\N	\N	\N	\N
04e9579f-6878-4d02-bb0e-49f3e35310ce	20	20	40	Daily Gift	2026-04-19 06:00:01.898	666239646711414787	\N	\N	\N	\N
f6113729-d0d1-46fb-9f14-ba6e97e65d2e	-6	62	56	Play on server Ariuan's Server	2026-04-19 12:13:15.258	658305794038825030	1	\N	\N	\N
f46f8b12-36bc-46e6-88e1-8832f6716990	-6	56	50	Play on server Ariuan's Server	2026-04-19 12:34:05.276	658305794038825030	1	\N	\N	\N
19e62f9e-0180-4bf4-8254-445fdaa830b6	-6	50	44	Play on server Ariuan's Server	2026-04-19 12:55:06.365	658305794038825030	1	\N	\N	\N
a3cc74db-db3f-4d69-b2a1-e0291982618e	-6	44	38	Play on server Ariuan's Server	2026-04-19 13:15:56.372	658305794038825030	1	\N	\N	\N
9c5f13be-c695-4437-ad19-a1b95d4f4ff3	-6	38	32	Play on server Ariuan's Server	2026-04-19 13:36:46.363	658305794038825030	1	\N	\N	\N
af20140c-739c-4521-9573-f6e03b20e3bb	-6	32	26	Play on server Ariuan's Server	2026-04-19 13:57:36.375	658305794038825030	1	\N	\N	\N
346169c4-27ef-45bb-87e7-5b7487d1dbb0	-6	26	20	Play on server Ariuan's Server	2026-04-19 14:09:47.259	658305794038825030	1	\N	\N	\N
92910b6f-ab1b-4273-8fa5-6046bd22c80f	20	40	60	Daily Gift	2026-04-20 06:00:00.422	666239646711414787	\N	\N	\N	\N
c48d54b6-62de-4db7-8e73-81a1bcaa2cdb	20	20	40	Daily Gift	2026-04-20 06:00:01.485	658305794038825030	\N	\N	\N	\N
dfdf22a0-f3b5-4b14-8b17-fb1e34cbd9d0	20	60	80	Daily Gift	2026-04-21 06:00:00.708	666239646711414787	\N	\N	\N	\N
02813bbd-818a-42bb-a0a3-3cf2cbb21713	20	40	60	Daily Gift	2026-04-21 06:00:01.241	658305794038825030	\N	\N	\N	\N
1feaca48-8e69-4e9d-bedc-216796b233d7	20	60	80	Daily Gift	2026-04-22 06:00:01.193	658305794038825030	\N	\N	\N	\N
68f235ee-c648-4c13-bca5-19aa71859eaf	-6	80	74	Play on server Ariuan's Server	2026-04-24 06:52:37.322	658305794038825030	1	\N	\N	\N
3b7f5472-90c6-4f87-964c-79d20aae6595	-6	128	122	Play on server Ariuan's Server	2026-04-24 06:53:27.855	780972375394091009	1	\N	\N	\N
acf88797-e882-438b-b394-65fb4a03389f	-6	74	68	Play on server Ariuan's Server	2026-04-24 06:56:20.135	658305794038825030	1	\N	\N	\N
2469d2e5-828d-40e8-bc47-536277dfb293	-6	122	116	Play on server Ariuan's Server	2026-04-24 07:02:15.515	780972375394091009	1	\N	\N	\N
e30bb71f-b07b-45c3-81a6-411e8a4452c5	-6	68	62	Play on server Ariuan's Server	2026-04-24 07:15:17.882	658305794038825030	1	\N	\N	\N
cabba496-f77a-4ffe-8999-47dcb3e537eb	-6	62	56	Play on server Ariuan's Server	2026-04-24 07:18:22.477	658305794038825030	1	\N	\N	\N
2cc4ad0c-8a83-4b6c-a14e-e736569ee5cb	-6	56	50	Play on server Ariuan's Server	2026-04-24 07:18:28.309	658305794038825030	1	\N	\N	\N
e0133f16-b76a-49f0-bdb2-7b2dbbf65374	-6	50	44	Play on server Ariuan's Server	2026-04-24 07:19:40.268	658305794038825030	1	\N	\N	\N
f643c1e2-4273-4948-bfea-39172487bdd1	-6	44	38	Play on server Ariuan's Server	2026-04-24 07:19:47.201	658305794038825030	1	\N	\N	\N
7adbd2cd-d52a-4a78-b79a-66a89356d797	-6	38	32	Play on server Ariuan's Server	2026-04-24 07:19:59.303	658305794038825030	1	\N	\N	\N
464774dc-12be-4c22-b492-db44854381b2	-6	32	26	Play on server Ariuan's Server	2026-04-24 07:20:17.434	658305794038825030	1	\N	\N	\N
fc80804a-cc56-4664-8165-41eff51aded0	-6	116	110	Play on server Ariuan's Server	2026-04-24 07:21:37.106	780972375394091009	1	\N	\N	\N
03834324-dfee-4611-8a11-c557b5e0eb38	-6	110	104	Play on server Ariuan's Server	2026-04-24 07:25:47.124	780972375394091009	1	\N	\N	\N
5a08c237-7d42-4a19-a07e-0292ec0a85e7	-6	104	98	Play on server Ariuan's Server	2026-04-24 07:35:09.129	780972375394091009	1	\N	\N	\N
597ac953-7d43-428d-9c3e-c938e0c7f3f3	-6	26	20	Play on server Ariuan's Server	2026-04-24 07:36:59.848	658305794038825030	1	\N	\N	\N
fea25910-bc68-4e93-9bbf-541e4558d7d0	-6	20	14	Play on server Ariuan's Server	2026-04-24 07:41:09.848	658305794038825030	1	\N	\N	\N
27b34a9c-a15e-4f0f-832c-07d0716d85f9	-6	98	92	Play on server Ariuan's Server	2026-04-24 07:44:32.146	780972375394091009	1	\N	\N	\N
7d9c9425-e71b-4288-b2a3-a4412c3ad648	-6	92	86	Play on server Ariuan's Server	2026-04-24 07:48:42.143	780972375394091009	1	\N	\N	\N
f19b36d3-049b-4f34-ac46-05c3c4a45b4a	-6	86	80	Play on server Ariuan's Server	2026-04-24 07:57:02.15	780972375394091009	1	\N	\N	\N
94892c4b-fe29-4763-8a3b-7d5609f63562	-6	14	8	Play on server Ariuan's Server	2026-04-24 07:57:49.864	658305794038825030	1	\N	\N	\N
2a793bac-9b9b-44ba-8127-0a3ea56f557f	-6	8	2	Play on server Ariuan's Server	2026-04-24 08:01:59.875	658305794038825030	1	\N	\N	\N
574bd531-8d54-4a44-9e40-997c7077af89	-6	80	74	Play on server Ariuan's Server	2026-04-24 08:05:22.155	780972375394091009	1	\N	\N	\N
d8b6a334-271a-4fe1-b88e-7972384bfbcb	-6	74	68	Play on server Ariuan's Server	2026-04-24 08:09:32.164	780972375394091009	1	\N	\N	\N
6be25abf-c5ad-444a-88db-3d540b0a3551	-6	68	62	Play on server Ariuan's Server	2026-04-24 08:17:52.165	780972375394091009	1	\N	\N	\N
5ae1dc0f-aecb-4a6d-a1a7-88fd1df8c3c9	-6	2	-4	Play on server Ariuan's Server	2026-04-24 08:18:39.874	658305794038825030	1	\N	\N	\N
e9a44d0a-ea02-410e-9683-b78edaba5f2c	-6	-4	-10	Play on server Ariuan's Server	2026-04-24 08:22:49.862	658305794038825030	1	\N	\N	\N
2ffb57be-334e-4858-b6a3-5aa2aa790b27	-6	62	56	Play on server Ariuan's Server	2026-04-24 08:26:12.173	780972375394091009	1	\N	\N	\N
ede7290d-97cd-41ab-9b7f-16a8ef08aa75	-6	56	50	Play on server Ariuan's Server	2026-04-24 08:30:22.172	780972375394091009	1	\N	\N	\N
faf6957b-ad65-4463-bc3e-0c6240b631ec	-6	50	44	Play on server Ariuan's Server	2026-04-24 08:38:42.182	780972375394091009	1	\N	\N	\N
95ea98e4-839b-4fce-937b-2b3c525e793b	-6	-10	-16	Play on server Ariuan's Server	2026-04-24 08:39:29.882	658305794038825030	1	\N	\N	\N
af071b79-4e2f-487c-be77-1105444d2768	-6	-16	-22	Play on server Ariuan's Server	2026-04-24 08:40:06.285	658305794038825030	1	\N	\N	\N
835aca13-7528-4168-905d-75d8668f01b3	-6	-22	-28	Play on server Ariuan's Server	2026-04-24 08:42:03.886	658305794038825030	1	\N	\N	\N
a756a21e-6362-43fb-9920-247214a6e8cd	-6	-28	-34	Play on server Ariuan's Server	2026-04-24 08:46:17.498	658305794038825030	1	\N	\N	\N
70311b9f-a38e-47f1-952f-11581af5b9b8	-6	44	38	Play on server Ariuan's Server	2026-04-24 08:47:02.186	780972375394091009	1	\N	\N	\N
1de67715-86fb-4a78-a9ec-be9c4812529b	-6	-34	-40	Play on server Ariuan's Server	2026-04-24 08:49:15.193	658305794038825030	1	\N	\N	\N
c258882f-1af3-4d1d-b5a9-d9ac2fe1fe19	-6	38	32	Play on server Ariuan's Server	2026-04-24 08:51:12.177	780972375394091009	1	\N	\N	\N
9971c29c-8662-4a8d-8fa8-06d4829fc8ce	-6	32	26	Play on server Ariuan's Server	2026-04-24 08:59:32.188	780972375394091009	1	\N	\N	\N
ca9be680-ed91-4e37-b478-ee8e24b684fd	-6	-40	-46	Play on server Ariuan's Server	2026-04-24 09:03:11.81	658305794038825030	1	\N	\N	\N
ae49d49b-9f4d-4c2f-a648-d789a570a2e2	-6	-46	-52	Play on server Ariuan's Server	2026-04-24 09:07:21.802	658305794038825030	1	\N	\N	\N
10fea805-4603-4573-ad5b-f4c8ef646cd1	-6	26	20	Play on server Ariuan's Server	2026-04-24 09:07:52.193	780972375394091009	1	\N	\N	\N
4ee10d95-7048-4d25-8aa1-a2efa23b22cb	-6	-52	-58	Play on server Ariuan's Server	2026-04-24 09:11:31.799	658305794038825030	1	\N	\N	\N
073ed712-391d-4dc9-be59-bbc1ceb31229	-6	20	14	Play on server Ariuan's Server	2026-04-24 09:12:02.193	780972375394091009	1	\N	\N	\N
404750c8-11af-4d38-bce0-4ebe5aec7635	-6	14	8	Play on server Ariuan's Server	2026-04-24 09:20:22.198	780972375394091009	1	\N	\N	\N
743d2eb8-63a6-4ab0-be18-ace9e66e8af6	-6	-58	-64	Play on server Ariuan's Server	2026-04-24 09:22:14.851	658305794038825030	1	\N	\N	\N
40c13337-2b9a-4566-a924-410ece0150cf	-6	-64	-70	Play on server Ariuan's Server	2026-04-24 09:26:55.633	658305794038825030	1	\N	\N	\N
e1fdfa8f-d415-4102-a7c2-2a03b6ae6b4f	-6	8	2	Play on server Ariuan's Server	2026-04-24 09:28:42.229	780972375394091009	1	\N	\N	\N
30d2c3f7-ef0b-42ef-a38a-c76133c8d889	-6	-70	-76	Play on server Ariuan's Server	2026-04-24 09:31:05.585	658305794038825030	1	\N	\N	\N
fd8e7951-bf34-4630-bb81-b91c2bf11f7c	-6	2	-4	Play on server Ariuan's Server	2026-04-24 09:32:52.251	780972375394091009	1	\N	\N	\N
7c4b2114-236b-4153-af65-86f2821262f8	-6	-76	-82	Play on server Ariuan's Server	2026-04-24 09:35:15.596	658305794038825030	1	\N	\N	\N
3ff01b69-e44b-4d77-a768-4002c71106e8	50	-4	46	Changed by admin	2026-04-24 09:36:22.661	780972375394091009	\N	\N	\N	\N
d72d09fe-b975-4737-a7cc-80546bcd1cc3	-6	46	40	Play on server Ariuan's Server	2026-04-24 09:41:29.82	780972375394091009	1	\N	\N	\N
13975361-5ecf-4e2d-8a50-1f0f693fdfff	-6	-82	-88	Play on server Ariuan's Server	2026-04-24 09:43:35.58	658305794038825030	1	\N	\N	\N
be5148be-03af-41ee-a57f-54c16691ee50	-6	-88	-94	Play on server Ariuan's Server	2026-04-24 09:47:45.579	658305794038825030	1	\N	\N	\N
cd12cdcb-6d39-4c1a-87a1-baffbf293bf7	-6	-94	-100	Play on server Ariuan's Server	2026-04-24 09:48:32.82	658305794038825030	1	\N	\N	\N
ad07030d-5468-4eb1-b9e7-aaf634fe2aed	-6	40	34	Play on server Ariuan's Server	2026-04-24 09:49:49.821	780972375394091009	1	\N	\N	\N
d6dbfd18-e019-40e3-93d2-66cda508c35a	-6	34	28	Play on server Ariuan's Server	2026-04-24 09:50:26.063	780972375394091009	1	\N	\N	\N
f2c7b8c5-2ddb-4825-ad2c-b5910a385330	20	28	48	Daily Gift	2026-04-25 06:00:00.314	780972375394091009	\N	\N	\N	\N
e9f202f7-811c-4632-8bdf-850a4700b3e9	20	-100	-80	Daily Gift	2026-04-25 06:00:01.487	658305794038825030	\N	\N	\N	\N
d0b01a34-e78d-466b-b540-b45b8c15d741	-6	-80	-86	Play on server Ariuan's Server	2026-04-25 07:36:59.32	658305794038825030	1	\N	\N	\N
b0dc98ea-25b1-4a2e-b695-8828536c6081	-6	-86	-92	Play on server Ariuan's Server	2026-04-25 07:45:19.318	658305794038825030	1	\N	\N	\N
c55ee4e3-f2c3-45d6-9910-a8a6a36d72cc	-6	-92	-98	Play on server Ariuan's Server	2026-04-25 07:53:39.312	658305794038825030	1	\N	\N	\N
b13a64a8-7b84-40bd-9e7a-1bf1e7b2f78f	-6	-98	-104	Play on server Ariuan's Server	2026-04-25 08:01:59.314	658305794038825030	1	\N	\N	\N
ff06ad26-8502-4ff4-b689-cae152e64cc6	-6	-104	-110	Play on server Ariuan's Server	2026-04-25 08:10:19.309	658305794038825030	1	\N	\N	\N
3935e056-fec2-4251-abd9-dbd2917dcd2f	-6	-110	-116	Play on server Ariuan's Server	2026-04-25 08:18:39.316	658305794038825030	1	\N	\N	\N
d4dbb50f-6430-4c98-a7f1-f7839f470270	-6	-116	-122	Play on server Ariuan's Server	2026-04-25 08:22:35.74	658305794038825030	1	\N	\N	\N
1c79fef5-74ed-4733-930f-6ff0e0db037f	-30	48	18	New Start Server Poll	2026-04-25 09:29:32.285	780972375394091009	1	\N	\N	\N
156e420d-bbcb-4648-8716-a3f1b22e96e4	-15	18	3	Approval Poll Reaction: Start Server at Ariuan's Server	2026-04-25 09:29:50.664	780972375394091009	1	\N	\N	\N
8768c79b-af9e-4874-8af0-ee153303fd4c	-6	3	-3	Play on server Ariuan's Server	2026-04-25 09:31:15.148	780972375394091009	1	\N	\N	\N
1e972d76-1a97-4dbd-a548-ba16840b7138	-6	-122	-128	Play on server Ariuan's Server	2026-04-25 09:36:18.581	658305794038825030	1	\N	\N	\N
69431826-6ccb-4be3-bc33-fd570796e2ca	-6	-3	-9	Play on server Ariuan's Server	2026-04-25 09:39:59.745	780972375394091009	1	\N	\N	\N
a894c751-96fc-4701-af7e-0e9696f79f72	-6	-128	-134	Play on server Ariuan's Server	2026-04-25 09:44:38.58	658305794038825030	1	\N	\N	\N
caf53748-691b-45d8-866c-0532eb1f4e39	-6	-9	-15	Play on server Ariuan's Server	2026-04-25 09:47:42.143	780972375394091009	1	\N	\N	\N
28c48ccd-401a-4865-a9e6-37c5a3ead343	-6	-134	-140	Play on server Ariuan's Server	2026-04-25 09:52:58.571	658305794038825030	1	\N	\N	\N
c1ee0fd2-9abf-4648-95f3-3c58b6cd77ed	-6	-15	-21	Play on server Ariuan's Server	2026-04-25 09:53:42.644	780972375394091009	1	\N	\N	\N
b37eefd0-7810-47e0-a6ba-55296f5f2420	100	-21	79	Changed by admin	2026-04-25 09:55:37.109	780972375394091009	\N	\N	\N	\N
5a9ecf5a-4b3a-40f7-88e8-d0757b00a2aa	-6	-140	-146	Play on server Ariuan's Server	2026-04-25 09:57:15.114	658305794038825030	1	\N	\N	\N
ff5e33a9-9ce0-4c42-b110-f55f1e5beec7	-6	-146	-152	Play on server Ariuan's Server	2026-04-25 09:58:07.612	658305794038825030	1	\N	\N	\N
b68bfb1a-26a6-4304-89e4-299e8f620fec	152	-152	0	Set by admin	2026-04-25 09:58:40.301	658305794038825030	\N	\N	\N	\N
96ff81e2-6396-432a-b424-40bece63df96	-6	0	-6	Play on server Ariuan's Server	2026-04-25 09:59:28.718	658305794038825030	1	\N	\N	\N
7d276e4c-010a-4dc0-91a0-303a851788e4	-6	-6	-12	Play on server Ariuan's Server	2026-04-25 10:00:55.371	658305794038825030	1	\N	\N	\N
65d85a4e-3f47-42a8-b025-a805303573b6	-79	79	0	Set by admin	2026-04-25 10:05:29.588	780972375394091009	\N	\N	\N	\N
6a7469ae-6d23-45d2-9a96-6f6534bdbfb4	0	0	0	Set by admin	2026-04-25 10:05:47.178	780972375394091009	\N	\N	\N	\N
a49302fd-1564-4264-a1d2-4a8fa9a47a81	120	0	120	Set by admin	2026-04-25 10:07:57.304	780972375394091009	\N	\N	\N	\N
7159b45d-f516-4c00-94d7-8259d37f5588	20	-12	8	Daily Gift	2026-04-26 06:00:00.529	658305794038825030	\N	\N	\N	\N
402a7c49-21d6-41b9-a4ad-657b2902b559	-30	120	90	New Start Server Poll (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-04-26 07:36:22.003	780972375394091009	1	\N	\N	\N
6ce83a1b-09ac-42b0-b823-49d030cddeab	-15	90	75	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-04-26 07:36:37.295	780972375394091009	1	\N	\N	\N
8e562bb5-1b1a-44b7-b081-5ae2cccc3644	-6	75	69	Play on server Ariuan's Server	2026-04-26 07:37:07.764	780972375394091009	1	\N	\N	\N
cbfdda01-bb75-4cc3-bee6-42bd4909f5b6	-6	69	63	Play on server Ariuan's Server	2026-04-26 07:45:27.8	780972375394091009	1	\N	\N	\N
5b28379a-32af-4505-a550-c3df812d0789	-6	63	57	Play on server Ariuan's Server	2026-04-26 07:53:47.786	780972375394091009	1	\N	\N	\N
735b109e-ad50-4c4f-8e81-7d3c1f4e73f1	-6	57	51	Play on server Ariuan's Server	2026-04-26 08:02:07.788	780972375394091009	1	\N	\N	\N
d88e5f00-eb67-433f-b761-18f44b0530f1	-6	51	45	Play on server Ariuan's Server	2026-04-26 08:10:27.773	780972375394091009	1	\N	\N	\N
b0c4a8ef-c7d9-4324-951d-aa7e7cd796f6	-6	45	39	Play on server Ariuan's Server	2026-04-26 08:18:47.793	780972375394091009	1	\N	\N	\N
1a6f8fb5-e49f-4865-9591-6b42303a373e	-6	39	33	Play on server Ariuan's Server	2026-04-26 08:27:07.805	780972375394091009	1	\N	\N	\N
796965ce-7f48-4f8c-870f-bbf8325bebf6	-6	33	27	Play on server Ariuan's Server	2026-04-26 08:35:27.819	780972375394091009	1	\N	\N	\N
0ac97c07-1a10-46c9-943f-8e21c1b0aa36	-6	27	21	Play on server Ariuan's Server	2026-04-26 08:43:47.825	780972375394091009	1	\N	\N	\N
63313b80-735b-4302-aa01-4cd05fa7031b	-6	21	15	Play on server Ariuan's Server	2026-04-26 08:52:07.826	780972375394091009	1	\N	\N	\N
066b91da-0dba-45cd-8ff4-0d56c3cf87ea	-6	8	2	Play on server Ariuan's Server	2026-04-26 08:57:27.992	658305794038825030	1	\N	\N	\N
6eb2d3a8-f43a-4c77-87e8-04a01cb6bb16	-6	2	-4	Play on server Ariuan's Server	2026-04-26 08:57:52.663	658305794038825030	1	\N	\N	\N
4c496e01-735f-49b9-8770-11aba56f8fb5	-6	-4	-10	Play on server Ariuan's Server	2026-04-26 08:58:00.289	658305794038825030	1	\N	\N	\N
e55f566f-42bd-436f-af27-4e8a44c7a4dd	-6	15	9	Play on server Ariuan's Server	2026-04-26 09:00:27.807	780972375394091009	1	\N	\N	\N
556242cc-5dad-4268-8740-2c9e55548d52	-6	-10	-16	Play on server Ariuan's Server	2026-04-26 09:06:22.824	658305794038825030	1	\N	\N	\N
292986d3-eea7-4982-9a04-766470d84c9d	-6	9	3	Play on server Ariuan's Server	2026-04-26 09:08:47.809	780972375394091009	1	\N	\N	\N
7da61dba-8041-44d2-af8e-cc6545046918	-6	-16	-22	Play on server Ariuan's Server	2026-04-26 09:09:47.125	658305794038825030	1	\N	\N	\N
c283089f-1221-4fcd-9279-6f1ddc13a541	-6	3	-3	Play on server Ariuan's Server	2026-04-26 09:17:07.884	780972375394091009	1	\N	\N	\N
b79a8765-9759-4534-81d9-18911ca7949d	-6	-22	-28	Play on server Ariuan's Server	2026-04-26 09:18:43.545	658305794038825030	1	\N	\N	\N
a2f25201-2ac8-4d56-928e-c96d0e0712f8	-6	-3	-9	Play on server Ariuan's Server	2026-04-26 09:20:49.472	780972375394091009	1	\N	\N	\N
c5027573-ac3c-46ea-bee0-e42ec8b29d66	48	-28	20	Set by admin	2026-04-26 09:29:22.525	658305794038825030	\N	\N	\N	\N
64e1cb18-e6d9-43ff-b384-7f89aa6ae942	-6	20	14	Play on server Ariuan's Server	2026-04-26 09:29:26.32	658305794038825030	1	\N	\N	\N
37d1398e-387d-4dd9-8f22-43c530de2135	59	-9	50	Set by admin	2026-04-26 09:37:51.82	780972375394091009	\N	\N	\N	\N
e1141967-fa37-4fe8-b169-c82f00fc5542	-30	50	20	New Start Server Poll (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-04-26 09:38:17.967	780972375394091009	1	\N	\N	\N
baf25134-cc44-43f8-aa22-44e3a8e6f53f	-15	20	5	Approval Poll Reaction: Start Server at Ariuan's Server	2026-04-26 09:38:22.599	780972375394091009	1	\N	\N	\N
6200b9af-46dd-42b0-a28b-12c8a4d83e22	-6	14	8	Play on server Ariuan's Server	2026-04-26 09:48:31.679	658305794038825030	1	\N	\N	\N
b49ca11d-f34c-468e-8500-62ce4cbfb82c	-6	8	2	Play on server Ariuan's Server	2026-04-26 09:56:51.692	658305794038825030	1	\N	\N	\N
88f9eb66-9901-490a-a714-a1963bd30ad8	95	5	100	Set by admin	2026-04-26 14:44:25.11	780972375394091009	\N	\N	\N	\N
32e75b20-5e4e-4a29-9c7f-27b3b0c9c514	-30	100	70	New Start Server Poll (Using Ticket(s): `Pay Less Play More`, saved 0 credits)	2026-04-26 14:46:12.961	780972375394091009	1	\N	\N	\N
b7a61d1d-09b1-486c-a42e-dc6b87ed40c5	198	2	200	Set by admin	2026-04-26 14:48:06.303	658305794038825030	\N	\N	\N	\N
4d59a7f8-a447-497f-bf6f-50ad0b5ca013	20	70	90	Received Transfer Credit	2026-04-26 14:48:28.664	780972375394091009	\N	\N	\N	\N
d3dc5397-3e69-4e75-a848-9e1993fc64a1	-30	90	60	New Start Server Poll (Using Ticket(s): `Pay Less Play More`, saved 0 credits)	2026-04-26 14:49:05.002	780972375394091009	1	\N	\N	\N
34ab2b52-087a-4f32-98fd-87f31ba7b417	0	60	60	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket(s): `Witch Farm Builder`, saved 15 credits)	2026-04-26 14:49:49.346	780972375394091009	1	\N	\N	\N
a790d355-860a-411e-9796-2f382c6ba143	-6	200	194	Play on server Ariuan's Server	2026-04-26 15:44:48.137	658305794038825030	1	\N	\N	\N
4e7dba1b-ab94-4d8d-ab4c-9f1268cb196d	-6	194	188	Play on server Ariuan's Server	2026-04-26 16:02:29.092	658305794038825030	1	\N	\N	\N
a767105f-ce73-4849-97ff-b5297e2f20a1	-6	188	182	Play on server Ariuan's Server	2026-04-26 16:26:29.259	658305794038825030	1	\N	\N	\N
6ddb46ef-8a10-4298-b2d0-4be0aa6b60d8	-6	182	176	Play on server Ariuan's Server	2026-04-26 16:34:49.277	658305794038825030	1	\N	\N	\N
e27e81fa-d1d0-4d47-80c1-e73019c3742e	-6	176	170	Play on server Ariuan's Server	2026-04-26 16:40:56.847	658305794038825030	1	\N	\N	\N
aba011ce-a86b-4b37-b58a-cf36728b3c05	-6	170	164	Play on server Ariuan's Server	2026-04-26 16:49:16.842	658305794038825030	1	\N	\N	\N
e6872ef1-55b9-43d6-a143-bf7303331700	-6	164	158	Play on server Ariuan's Server	2026-04-26 16:57:36.853	658305794038825030	1	\N	\N	\N
2940b73d-afd2-4799-9cd9-b207c90f8f39	-6	158	152	Play on server Ariuan's Server	2026-04-26 17:05:56.763	658305794038825030	1	\N	\N	\N
33538fc0-36ce-4e00-a5a0-83bc49cd8be5	-6	152	146	Play on server Ariuan's Server	2026-04-26 17:14:16.755	658305794038825030	1	\N	\N	\N
8e959055-d843-4a92-a918-f4168f12c320	-6	60	54	Play on server Ariuan's Server	2026-04-26 17:16:10.145	780972375394091009	1	\N	\N	\N
48ae4a9a-9402-4a4f-b4c2-e9746d5ad37d	-6	146	140	Play on server Ariuan's Server	2026-04-26 17:22:36.746	658305794038825030	1	\N	\N	\N
ca5e837f-ec4c-4bc5-a5bc-f586f7f86119	-6	54	48	Play on server Ariuan's Server	2026-04-26 17:24:30.122	780972375394091009	1	\N	\N	\N
628f5698-971b-4b19-8e80-92cd87ad824e	-6	48	42	Play on server Ariuan's Server	2026-04-26 17:32:50.121	780972375394091009	1	\N	\N	\N
c34fe42c-b58f-432f-b0c2-c124917521bb	-6	42	36	Play on server Ariuan's Server	2026-04-26 17:41:10.127	780972375394091009	1	\N	\N	\N
7fe90298-c702-48a4-a3f1-51e346aff8c5	-6	36	30	Play on server Ariuan's Server	2026-04-26 17:49:30.189	780972375394091009	1	\N	\N	\N
8fed991a-0daf-479a-a6c1-9bd5411a4f5b	-6	30	24	Play on server Ariuan's Server	2026-04-26 17:57:50.193	780972375394091009	1	\N	\N	\N
247c07c9-d114-4151-93af-c1edc8e3f121	-6	24	18	Play on server Ariuan's Server	2026-04-26 18:06:10.182	780972375394091009	1	\N	\N	\N
f791cc41-9758-4efb-9d37-05b1535b026d	-6	18	12	Play on server Ariuan's Server	2026-04-26 18:14:30.172	780972375394091009	1	\N	\N	\N
0316b81b-5274-4069-a746-48768d44e62b	-6	12	6	Play on server Ariuan's Server	2026-04-26 18:22:50.168	780972375394091009	1	\N	\N	\N
5cc88c86-0936-4f60-8ade-39578976857b	-6	6	0	Play on server Ariuan's Server	2026-04-26 18:31:10.185	780972375394091009	1	\N	\N	\N
52c5a0c2-19f1-4e51-b85c-a4814f2a3b62	80	140	220	Daily Gift	2026-04-27 06:00:00.488	658305794038825030	\N	\N	\N	\N
59731423-ef9a-4a8e-9e7a-7444b16183a1	80	0	80	Daily Gift	2026-04-27 06:00:01.095	780972375394091009	\N	\N	\N	\N
61a872a8-c25f-43cb-9b8a-501634b3c430	80	80	160	Daily Gift	2026-04-27 06:00:01.603	666239646711414787	\N	\N	\N	\N
0464c40f-ab16-416d-9cca-8ce604994c1d	-6	220	214	Play on server Ariuan's Server	2026-04-27 09:06:32.891	658305794038825030	1	\N	\N	\N
9584e751-7f28-483b-a603-d1416a7544d4	-6	214	208	Play on server Ariuan's Server	2026-04-27 09:14:56.008	658305794038825030	1	\N	\N	\N
a794a050-1ef5-4144-8314-6bd71890e612	-6	208	202	Play on server Ariuan's Server	2026-04-27 09:20:25.706	658305794038825030	1	\N	\N	\N
6b8206d3-1dd7-4098-a9dc-6a39a4550782	-6	202	196	Play on server Ariuan's Server	2026-04-27 09:44:59.226	658305794038825030	1	\N	\N	\N
78b53c4d-e6e4-4366-82a4-3b4a117fbb88	-6	196	190	Play on server Ariuan's Server	2026-04-27 09:53:19.939	658305794038825030	1	\N	\N	\N
527c4056-e642-4c89-8434-2146b0ada3c5	-6	190	184	Play on server Ariuan's Server	2026-04-27 10:01:41.169	658305794038825030	1	\N	\N	\N
ebab3a33-4cc6-4f8f-975f-70930a0cfd52	-6	80	74	Play on server Ariuan's Server	2026-04-27 11:45:56.809	780972375394091009	1	\N	\N	\N
93c6f851-0fbc-4f8c-ad82-ed4749c61353	-6	184	178	Play on server Ariuan's Server	2026-04-27 11:55:48.533	658305794038825030	1	\N	\N	\N
3c58dee2-89c6-415b-8cd0-34deae4d60e6	-6	178	172	Play on server Ariuan's Server	2026-04-27 12:04:08.858	658305794038825030	1	\N	\N	\N
3ac8c324-9c68-49bb-980c-c60f0feda18c	-6	172	166	Play on server Ariuan's Server	2026-04-27 12:12:28.762	658305794038825030	1	\N	\N	\N
0dc06340-1054-45eb-a126-e34d51ce3e65	-30	74	44	New Start Server Poll (Using Ticket(s): `Pay Less Play More`, saved 0 credits)	2026-04-28 05:59:27.708	780972375394091009	1	\N	\N	\N
76fd7c10-8a17-495b-b689-0383fa352cc4	0	44	44	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket(s): `Witch Farm Builder`, saved 15 credits)	2026-04-28 05:59:48.008	780972375394091009	1	\N	\N	\N
cc10ed2a-5418-4d2a-b2a6-d277f2cccc62	20	44	64	Daily Gift	2026-04-28 06:00:00.35	780972375394091009	\N	\N	\N	\N
b973ecb2-380d-46db-b363-b9916eb46292	-6	166	160	Play on server Ariuan's Server	2026-04-28 06:55:25.676	658305794038825030	1	\N	\N	\N
0f32254a-5d15-4fec-a629-8a5ab668868f	-6	160	154	Play on server Ariuan's Server	2026-04-28 07:03:45.653	658305794038825030	1	\N	\N	\N
8cc367d8-f543-4446-9fb8-1d8e18ba820a	-6	64	58	Play on server Ariuan's Server	2026-04-28 09:02:28.469	780972375394091009	1	\N	\N	\N
10e5fd36-ef40-4e3c-ad70-7db626dcb2d4	-6	58	52	Play on server Ariuan's Server	2026-04-28 09:10:48.467	780972375394091009	1	\N	\N	\N
0306ab6f-dac6-4c2f-93bb-d68341df0aff	-6	52	46	Play on server Ariuan's Server	2026-04-28 09:19:08.434	780972375394091009	1	\N	\N	\N
dee964a9-f652-457c-97a2-27e415319d3d	-6	46	40	Play on server Ariuan's Server	2026-04-28 09:27:28.437	780972375394091009	1	\N	\N	\N
34fa2730-3710-4ae1-87a7-6f96e2949aac	-6	40	34	Play on server Ariuan's Server	2026-04-28 09:35:48.438	780972375394091009	1	\N	\N	\N
7c3c9dc2-41a6-4805-83bc-388a145a65ec	-6	34	28	Play on server Ariuan's Server	2026-04-28 09:44:08.455	780972375394091009	1	\N	\N	\N
8ae2c2e7-ff14-4512-a7c2-6ff1184f95c3	-6	28	22	Play on server Ariuan's Server	2026-04-28 11:56:39.511	780972375394091009	1	\N	\N	\N
e68de32e-da85-400d-98d9-4f097b3db498	-6	22	16	Play on server Ariuan's Server	2026-04-28 12:04:59.541	780972375394091009	1	\N	\N	\N
e625ace4-6f19-4d8e-a01f-c96f86a7cd63	-6	16	10	Play on server Ariuan's Server	2026-04-28 12:13:19.539	780972375394091009	1	\N	\N	\N
4778a446-2d5f-4921-addb-401404d8d3dc	-6	10	4	Play on server Ariuan's Server	2026-04-28 12:21:39.542	780972375394091009	1	\N	\N	\N
25127768-3e8e-4ed3-8a73-5128c0d818ea	-6	154	148	Play on server Ariuan's Server	2026-04-28 15:00:41.355	658305794038825030	1	\N	\N	\N
8d148899-e0f4-4896-b4c0-9fd1f18a2ba6	-6	148	142	Play on server Ariuan's Server	2026-04-28 15:09:01.386	658305794038825030	1	\N	\N	\N
d4d1ab35-3b79-4f7a-8c26-dc775f926204	-6	142	136	Play on server Ariuan's Server	2026-04-28 15:17:21.383	658305794038825030	1	\N	\N	\N
ab0848a1-11ea-4e43-829c-108efd5f2b1d	-6	136	130	Play on server Ariuan's Server	2026-04-28 15:25:41.361	658305794038825030	1	\N	\N	\N
d6cc3f96-8080-43c3-beb0-5473de855432	80	4	84	Changed by admin	2026-04-28 15:27:56.752	780972375394091009	\N	\N	\N	\N
869261cf-4695-41c1-b9a1-45ba4dc71121	-6	84	78	Play on server Ariuan's Server	2026-04-28 15:28:08.783	780972375394091009	1	\N	\N	\N
2830a2ac-65dc-489c-8a8b-7cb5f7e87b58	-6	130	124	Play on server Ariuan's Server	2026-04-28 15:34:01.363	658305794038825030	1	\N	\N	\N
ad71ed87-1229-4a83-b06b-5f3b503e33d2	-6	78	72	Play on server Ariuan's Server	2026-04-28 15:36:28.839	780972375394091009	1	\N	\N	\N
b173113f-8127-494c-b29f-49c94309d926	-6	124	118	Play on server Ariuan's Server	2026-04-28 15:42:21.36	658305794038825030	1	\N	\N	\N
bba91759-5349-452f-a815-5538e4c990c2	-6	72	66	Play on server Ariuan's Server	2026-04-28 15:44:48.809	780972375394091009	1	\N	\N	\N
241c5f86-0a3b-4095-89e5-29f6a61a6281	-6	118	112	Play on server Ariuan's Server	2026-04-28 15:50:41.375	658305794038825030	1	\N	\N	\N
5f8690ee-e059-4df8-aa60-3330b5816a8b	-6	66	60	Play on server Ariuan's Server	2026-04-28 15:53:08.81	780972375394091009	1	\N	\N	\N
341ea527-38eb-494f-af0c-546a24f50a74	-6	112	106	Play on server Ariuan's Server	2026-04-28 15:59:01.374	658305794038825030	1	\N	\N	\N
4378ba36-665f-4ae7-9d69-8d38fbd3b6e2	-6	60	54	Play on server Ariuan's Server	2026-04-28 16:01:28.806	780972375394091009	1	\N	\N	\N
37873a54-4f73-41da-90b1-e936002e0873	-6	106	100	Play on server Ariuan's Server	2026-04-28 16:07:21.372	658305794038825030	1	\N	\N	\N
3db2ebf8-b2bf-4828-9a06-17284de3ba7f	-6	54	48	Play on server Ariuan's Server	2026-04-28 16:09:48.815	780972375394091009	1	\N	\N	\N
74d8948c-3ce7-480e-8812-38b69238aee9	20	48	68	Daily Gift	2026-04-29 06:00:00.75	780972375394091009	\N	\N	\N	\N
46db7f46-2706-4169-97c2-5609097a115a	20	68	88	Daily Gift	2026-04-30 06:00:01.236	780972375394091009	\N	\N	\N	\N
aa7b67b8-b6c9-462c-88d8-f49edb93d07c	-30	88	58	New Start Server Poll (Using Ticket(s): `Witch Farm Builder`, saved 0 credits)	2026-05-01 07:41:23.259	780972375394091009	1	\N	\N	\N
b66c8fe1-c51c-4639-a6e4-c957311c0eb7	0	58	58	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket(s): `Witch Farm Builder`, saved 15 credits)	2026-05-01 07:41:43.157	780972375394091009	1	\N	\N	\N
66045331-7808-42f4-9230-985192f2c9ef	0	58	58	Approval Reaction Refund	2026-05-01 07:43:41.656	780972375394091009	1	\N	\N	\N
cbab68f7-261c-48a3-bc05-58ff39e3631f	-6	100	94	Play on server Ariuan's Server	2026-05-01 09:29:44.767	658305794038825030	1	\N	\N	\N
ad6d6788-dcc1-4c20-aabc-4e22d5d6dd6c	-6	58	52	Play on server Ariuan's Server	2026-05-01 14:30:48.435	780972375394091009	1	\N	\N	\N
c5864a2d-8959-4a07-a69a-0fe0b66b1377	-6	94	88	Play on server Ariuan's Server	2026-05-01 14:35:29.791	658305794038825030	1	\N	\N	\N
61c6f3b5-fe45-45b6-83d4-25a6fd874a02	-6	52	46	Play on server Ariuan's Server	2026-05-01 14:39:08.5	780972375394091009	1	\N	\N	\N
9062904a-182e-40b1-9989-496325805f11	-6	88	82	Play on server Ariuan's Server	2026-05-01 14:43:49.809	658305794038825030	1	\N	\N	\N
0039c5c9-ee1b-4db5-ad46-26de54c9d905	-6	46	40	Play on server Ariuan's Server	2026-05-01 14:47:08.684	780972375394091009	1	\N	\N	\N
2d7b8382-11cb-4e9e-9aeb-48c0b5b04b2c	-6	82	76	Play on server Ariuan's Server	2026-05-01 14:52:09.84	658305794038825030	1	\N	\N	\N
80f9a2d7-a5fc-495e-b206-13c4515dcf16	-6	40	34	Play on server Ariuan's Server	2026-05-01 14:55:28.692	780972375394091009	1	\N	\N	\N
284604dc-435a-43a6-a8d5-c48cce52dd41	-6	76	70	Play on server Ariuan's Server	2026-05-01 15:00:29.839	658305794038825030	1	\N	\N	\N
99e72bd8-7db9-4cd5-90f8-e3c0aedc3f9a	-6	34	28	Play on server Ariuan's Server	2026-05-01 15:03:48.76	780972375394091009	1	\N	\N	\N
fb058b70-bc8c-4c13-b038-34e33e87ddc5	-6	70	64	Play on server Ariuan's Server	2026-05-01 15:08:49.876	658305794038825030	1	\N	\N	\N
9ed14ca0-21e9-42d5-a84f-149c8058d458	-6	28	22	Play on server Ariuan's Server	2026-05-01 15:12:08.806	780972375394091009	1	\N	\N	\N
fdcf2731-9693-4157-b023-872bd8bb368b	-6	64	58	Play on server Ariuan's Server	2026-05-01 15:17:09.841	658305794038825030	1	\N	\N	\N
8774c56a-a682-4dd9-a3e6-47b78f045b02	-6	22	16	Play on server Ariuan's Server	2026-05-01 15:20:42.354	780972375394091009	1	\N	\N	\N
ed0f2721-0254-4a6e-afcf-027c075de5af	-6	58	52	Play on server Ariuan's Server	2026-05-01 15:25:29.844	658305794038825030	1	\N	\N	\N
2ffe3598-52ec-4d46-a7b2-b2ce83155b90	-6	16	10	Play on server Ariuan's Server	2026-05-01 15:29:02.29	780972375394091009	1	\N	\N	\N
5082fb04-7a03-4a03-a716-0526c25831f5	-6	52	46	Play on server Ariuan's Server	2026-05-01 15:33:49.91	658305794038825030	1	\N	\N	\N
91684622-d4d1-4071-a103-082f186fc9ec	-6	10	4	Play on server Ariuan's Server	2026-05-01 15:37:22.373	780972375394091009	1	\N	\N	\N
c9056612-d7c8-4710-a88d-87576add129f	-6	46	40	Play on server Ariuan's Server	2026-05-01 15:42:09.867	658305794038825030	1	\N	\N	\N
1da4e710-8d26-4083-8324-5348f42357e8	20	4	24	Daily Gift	2026-05-02 06:00:02.151	780972375394091009	\N	\N	\N	\N
93d5ef0e-5902-4e9f-ba22-a9c7953b3b76	20	40	60	Daily Gift	2026-05-02 06:00:02.689	658305794038825030	\N	\N	\N	\N
3e901817-1e20-4407-a3a7-2c854ef5e89d	100	160	260	Daily Gift	2026-05-03 06:00:02.677	666239646711414787	\N	\N	\N	\N
97e8c76f-aa60-4fbf-ac13-dc4958b1e4e0	100	24	124	Daily Gift	2026-05-03 06:00:04.522	780972375394091009	\N	\N	\N	\N
880fb4b4-9e2e-4efe-9568-c3d1076caae2	100	60	160	Daily Gift	2026-05-03 06:00:05.02	658305794038825030	\N	\N	\N	\N
48f702c3-a711-4bdc-a3a0-98f177703e88	-6	549	543	Play on server Ariuan's Server	2026-05-03 15:50:24.397	844193954756689921	1	\N	\N	\N
d2410f7d-86cb-45b4-9f84-cdb9e1d66309	-6	543	537	Play on server Ariuan's Server	2026-05-03 15:58:44.423	844193954756689921	1	\N	\N	\N
d0d7b614-f533-40e0-9223-f27ff326536e	-6	537	531	Play on server Ariuan's Server	2026-05-03 16:05:33.511	844193954756689921	1	\N	\N	\N
ef6f25b4-b38e-4a62-8434-acbd1dd80ee6	-6	531	525	Play on server Ariuan's Server	2026-05-03 16:10:50.02	844193954756689921	1	\N	\N	\N
dd612e59-b13f-4bed-84d9-dea10cc29206	-6	525	519	Play on server Ariuan's Server	2026-05-03 16:19:10.039	844193954756689921	1	\N	\N	\N
125d4279-2e2c-4828-9bd4-a9ef4788dc67	-6	519	513	Play on server Ariuan's Server	2026-05-03 16:27:29.978	844193954756689921	1	\N	\N	\N
70924f00-9e6f-420f-a9b9-e32b1994a148	-6	160	154	Play on server Ariuan's Server	2026-05-03 16:28:40.761	658305794038825030	1	\N	\N	\N
b8f1f949-8aa3-499f-a676-55a75e4ed30c	-6	513	507	Play on server Ariuan's Server	2026-05-03 16:35:49.965	844193954756689921	1	\N	\N	\N
cc27070c-8b57-4e14-9539-e9a4e410a406	-6	154	148	Play on server Ariuan's Server	2026-05-03 16:37:00.784	658305794038825030	1	\N	\N	\N
d8666df7-1752-4839-afb4-1e33822899f1	-6	507	501	Play on server Ariuan's Server	2026-05-03 16:44:09.969	844193954756689921	1	\N	\N	\N
fd3e91b8-d956-400c-b2f5-f12868833cc2	-6	148	142	Play on server Ariuan's Server	2026-05-03 16:45:20.785	658305794038825030	1	\N	\N	\N
351bbc91-83f7-4489-ad64-99f38a9656b3	-6	501	495	Play on server Ariuan's Server	2026-05-03 16:52:29.979	844193954756689921	1	\N	\N	\N
c8e30956-a95c-4141-a3e4-07fd9ae4aa64	-6	124	118	Play on server Ariuan's Server	2026-05-03 16:53:28.711	780972375394091009	1	\N	\N	\N
6f684e78-7d9f-4ccd-bb8a-c2077061effc	-6	142	136	Play on server Ariuan's Server	2026-05-03 16:53:40.79	658305794038825030	1	\N	\N	\N
1f6f02dc-bee3-4453-84b9-1ca17e9118bc	-6	495	489	Play on server Ariuan's Server	2026-05-03 16:57:30.261	844193954756689921	1	\N	\N	\N
39e873c6-0dda-44c3-a630-729d0be42360	-6	118	112	Play on server Ariuan's Server	2026-05-03 17:01:48.732	780972375394091009	1	\N	\N	\N
f175f159-730b-4344-abad-6daffaca8fe6	-6	136	130	Play on server Ariuan's Server	2026-05-03 17:02:00.793	658305794038825030	1	\N	\N	\N
35b4f49e-3beb-48e5-bc68-956adc7b297f	-6	489	483	Play on server Ariuan's Server	2026-05-03 17:05:50.263	844193954756689921	1	\N	\N	\N
c8107d17-fdaf-4cef-8cbd-c03b57502fd1	-6	112	106	Play on server Ariuan's Server	2026-05-03 17:10:08.739	780972375394091009	1	\N	\N	\N
1c6bbce1-26ef-4d33-a330-fb9110eb5244	-6	130	124	Play on server Ariuan's Server	2026-05-03 17:10:20.816	658305794038825030	1	\N	\N	\N
c506e1e5-243f-4a80-af61-ead851a8515a	-6	483	477	Play on server Ariuan's Server	2026-05-03 17:14:10.264	844193954756689921	1	\N	\N	\N
bbd597d7-0b7f-4988-a296-190c21501424	-6	124	118	Play on server Ariuan's Server	2026-05-03 17:16:08.802	658305794038825030	1	\N	\N	\N
008e8e96-a6db-41e8-a38d-e243b7db21b4	-6	106	100	Play on server Ariuan's Server	2026-05-03 17:18:28.734	780972375394091009	1	\N	\N	\N
7515a2ee-8e4e-4de1-9741-e2ff47b6a72b	-6	477	471	Play on server Ariuan's Server	2026-05-03 17:22:30.327	844193954756689921	1	\N	\N	\N
78b6d5eb-0c48-47ec-807c-010ac4b39373	-6	118	112	Play on server Ariuan's Server	2026-05-03 17:24:28.846	658305794038825030	1	\N	\N	\N
ddcf41c9-3165-4f7a-a4b4-2d64f4e2c3cb	-6	100	94	Play on server Ariuan's Server	2026-05-03 17:26:48.775	780972375394091009	1	\N	\N	\N
c2457c11-38f7-4d66-8cf2-ef4d48991570	-6	471	465	Play on server Ariuan's Server	2026-05-03 17:30:50.325	844193954756689921	1	\N	\N	\N
efd83caf-3697-4946-96f9-d070fec07235	-6	112	106	Play on server Ariuan's Server	2026-05-03 17:32:48.841	658305794038825030	1	\N	\N	\N
07abf90c-925b-402e-8f2c-506a2700370a	-6	94	88	Play on server Ariuan's Server	2026-05-03 17:35:08.771	780972375394091009	1	\N	\N	\N
af140d5b-eec2-4b35-8338-89316a3d41e7	-6	465	459	Play on server Ariuan's Server	2026-05-03 17:39:12.023	844193954756689921	1	\N	\N	\N
be50d8fb-de17-41a4-ac71-9532644d31a9	-6	106	100	Play on server Ariuan's Server	2026-05-03 17:41:08.833	658305794038825030	1	\N	\N	\N
5cdf906b-743b-40fb-9003-f8654ed8242a	-6	88	82	Play on server Ariuan's Server	2026-05-03 17:43:28.752	780972375394091009	1	\N	\N	\N
1a456eb0-6c7c-4a68-a552-9c50b8c586a1	-6	459	453	Play on server Ariuan's Server	2026-05-03 17:47:32.012	844193954756689921	1	\N	\N	\N
45efa772-d8e6-4efd-a5a2-50fafba1d7d2	-6	100	94	Play on server Ariuan's Server	2026-05-03 17:49:28.832	658305794038825030	1	\N	\N	\N
e6446876-1812-41c9-883e-86820575f595	-6	82	76	Play on server Ariuan's Server	2026-05-03 17:51:48.766	780972375394091009	1	\N	\N	\N
f9183026-70ea-49a7-955e-4b985cec2346	-6	453	447	Play on server Ariuan's Server	2026-05-03 17:53:52.454	844193954756689921	1	\N	\N	\N
af104207-938c-4212-93bb-f2b7de27d271	-6	94	88	Play on server Ariuan's Server	2026-05-03 17:57:48.83	658305794038825030	1	\N	\N	\N
a2a2d782-dc2d-4a1e-8a15-a5024d64fbc8	-6	76	70	Play on server Ariuan's Server	2026-05-03 18:00:08.747	780972375394091009	1	\N	\N	\N
3b7d7bb4-2e27-43a7-b70e-a0d18660742b	-6	447	441	Play on server Ariuan's Server	2026-05-03 18:02:12.459	844193954756689921	1	\N	\N	\N
0ac866c0-75d4-4ec1-bc65-f957b5d138dc	-6	88	82	Play on server Ariuan's Server	2026-05-03 18:06:08.83	658305794038825030	1	\N	\N	\N
0dee9cc1-ed2d-499d-873d-269c9aa049e0	-6	70	64	Play on server Ariuan's Server	2026-05-03 18:08:28.794	780972375394091009	1	\N	\N	\N
28d83fda-7ca5-4c28-9f71-0192ca7fe1b6	-6	441	435	Play on server Ariuan's Server	2026-05-03 18:10:32.475	844193954756689921	1	\N	\N	\N
24421eb9-703e-42ca-81da-03d80246c35c	-6	82	76	Play on server Ariuan's Server	2026-05-03 18:14:31.31	658305794038825030	1	\N	\N	\N
13f88799-4633-431d-a81d-d8ad1c5f51c6	-6	64	58	Play on server Ariuan's Server	2026-05-03 18:16:51.204	780972375394091009	1	\N	\N	\N
12076510-ec3f-466a-b915-84df108dbfe1	-6	435	429	Play on server Ariuan's Server	2026-05-03 18:18:54.91	844193954756689921	1	\N	\N	\N
9e91d841-35b2-4356-b793-e8e3f76de94a	-6	76	70	Play on server Ariuan's Server	2026-05-03 18:22:52.911	658305794038825030	1	\N	\N	\N
6753ee12-65e4-4234-8217-fac7e2dd3ab0	-6	58	52	Play on server Ariuan's Server	2026-05-03 18:25:13.178	780972375394091009	1	\N	\N	\N
73bb6c98-c490-4311-ba58-75c9c7de144f	-6	429	423	Play on server Ariuan's Server	2026-05-03 18:27:17.367	844193954756689921	1	\N	\N	\N
ce7ce7ff-5b0a-4b48-b916-4532d946eb66	-6	70	64	Play on server Ariuan's Server	2026-05-03 18:31:13.768	658305794038825030	1	\N	\N	\N
aa50cda4-eb23-47a1-b1ed-7ec8df161db3	-6	52	46	Play on server Ariuan's Server	2026-05-03 18:33:33.707	780972375394091009	1	\N	\N	\N
5a175d0e-e5f9-422a-aa67-54a57f73b613	-6	423	417	Play on server Ariuan's Server	2026-05-03 18:35:37.42	844193954756689921	1	\N	\N	\N
0623d145-98e6-4b65-9996-f1d13f0a1ba4	-6	64	58	Play on server Ariuan's Server	2026-05-03 18:39:33.786	658305794038825030	1	\N	\N	\N
35dde9f3-4394-4864-a025-75f065b04f40	-6	46	40	Play on server Ariuan's Server	2026-05-03 18:41:53.721	780972375394091009	1	\N	\N	\N
e465cfa3-26a4-42d4-bff8-78fafded8751	-6	417	411	Play on server Ariuan's Server	2026-05-03 18:43:57.415	844193954756689921	1	\N	\N	\N
d9a02e55-580a-4ab0-b8a0-32023d46c0c5	-6	58	52	Play on server Ariuan's Server	2026-05-03 18:47:53.792	658305794038825030	1	\N	\N	\N
93614487-ecdb-46a9-9984-23aec4fa4e89	-6	40	34	Play on server Ariuan's Server	2026-05-03 18:50:13.722	780972375394091009	1	\N	\N	\N
58339aee-b753-48c6-a43b-56c264f40166	-6	411	405	Play on server Ariuan's Server	2026-05-03 18:52:17.41	844193954756689921	1	\N	\N	\N
2fb4d78b-be9c-4810-954b-91350dcf368a	-6	52	46	Play on server Ariuan's Server	2026-05-03 18:56:13.738	658305794038825030	1	\N	\N	\N
0a0093bd-5d55-4f91-a324-3ff9cd6f30af	-6	34	28	Play on server Ariuan's Server	2026-05-03 18:58:33.663	780972375394091009	1	\N	\N	\N
cdebb059-b614-411e-9fc5-4ce2e7e85daf	100	28	128	監工費	2026-05-03 18:58:52.76	780972375394091009	\N	\N	\N	\N
c21c1ccb-78d2-4694-ae52-c5c6964ee026	1	405	406	施工費	2026-05-03 18:59:08.055	844193954756689921	\N	\N	\N	\N
330ff9d6-5088-4eb8-a323-206a17896a76	-6	406	400	Play on server Ariuan's Server	2026-05-03 19:00:37.366	844193954756689921	1	\N	\N	\N
ccab445f-2585-46a5-bc51-0530173dcc0a	-6	46	40	Play on server Ariuan's Server	2026-05-03 19:03:23.056	658305794038825030	1	\N	\N	\N
83004f7f-dd83-4325-9f47-d2b2ab14fa24	-6	400	394	Play on server Ariuan's Server	2026-05-03 19:08:57.34	844193954756689921	1	\N	\N	\N
68d9ac5c-59ca-4d44-87f3-9b47344b6209	-6	40	34	Play on server Ariuan's Server	2026-05-03 19:11:43.037	658305794038825030	1	\N	\N	\N
cbfd741a-4e79-4dba-a97b-7650ac9531da	-6	394	388	Play on server Ariuan's Server	2026-05-03 19:15:38.693	844193954756689921	1	\N	\N	\N
c06f1e6e-2de1-4b63-830f-f778be27a144	-6	34	28	Play on server Ariuan's Server	2026-05-03 19:20:03.001	658305794038825030	1	\N	\N	\N
5c29fbd8-59ca-4183-b0da-a3b4f5190dae	-6	388	382	Play on server Ariuan's Server	2026-05-03 19:23:58.675	844193954756689921	1	\N	\N	\N
65ebb1c2-d328-4158-99c0-f9eb500de606	-6	28	22	Play on server Ariuan's Server	2026-05-03 19:26:03.848	658305794038825030	1	\N	\N	\N
91c6771a-92d7-44fa-b564-d452056ffc94	-6	382	376	Play on server Ariuan's Server	2026-05-03 19:32:18.678	844193954756689921	1	\N	\N	\N
0098ed85-1e1a-4efb-8c90-d514124a21a4	-6	22	16	Play on server Ariuan's Server	2026-05-03 19:34:23.843	658305794038825030	1	\N	\N	\N
67a1b291-6ca7-49dd-8e91-228b13a473e4	-6	376	370	Play on server Ariuan's Server	2026-05-03 19:40:38.71	844193954756689921	1	\N	\N	\N
00e10a2b-9d62-460f-abc5-2a4ca5ffc083	-6	16	10	Play on server Ariuan's Server	2026-05-03 19:42:43.882	658305794038825030	1	\N	\N	\N
54be74cd-ca7a-4fec-b6a5-c8fe6cfca5aa	100	128	228	Daily Gift	2026-05-04 06:00:03.066	780972375394091009	\N	\N	\N	\N
94673875-c263-478d-b5cd-33c6e33f3791	100	10	110	Daily Gift	2026-05-04 06:00:03.824	658305794038825030	\N	\N	\N	\N
dbe95696-268c-4b8c-80e5-0ebea219c4bd	-6	110	104	Play on server Ariuan's Server	2026-05-04 13:21:57.845	658305794038825030	1	\N	\N	\N
a1fe790e-247c-48cf-b334-496a4392f25b	-6	104	98	Play on server Ariuan's Server	2026-05-04 13:30:17.938	658305794038825030	1	\N	\N	\N
380bd4b8-21bb-484c-9146-c94b92ee9e9e	-6	370	364	Play on server Ariuan's Server	2026-05-04 13:32:10.741	844193954756689921	1	\N	\N	\N
4fc4af63-eea1-4cdf-afb3-a042cfe799b3	-6	98	92	Play on server Ariuan's Server	2026-05-04 13:38:41.314	658305794038825030	1	\N	\N	\N
d3107d13-6313-4257-b90a-161c05e31874	-6	364	358	Play on server Ariuan's Server	2026-05-04 13:40:33.598	844193954756689921	1	\N	\N	\N
f180c39d-3c24-4812-acaf-7235b83134c8	-6	92	86	Play on server Ariuan's Server	2026-05-04 13:47:01.261	658305794038825030	1	\N	\N	\N
7fb1a1c1-6bb1-4cfb-a0fc-8439ef982167	-6	358	352	Play on server Ariuan's Server	2026-05-04 13:48:53.593	844193954756689921	1	\N	\N	\N
06703c15-12ce-47cc-8430-2337ed8e6827	-6	86	80	Play on server Ariuan's Server	2026-05-04 13:55:21.257	658305794038825030	1	\N	\N	\N
ea032a96-3745-43d7-93e7-b7e3fb4b83a3	-6	352	346	Play on server Ariuan's Server	2026-05-04 13:57:13.594	844193954756689921	1	\N	\N	\N
3fe9f9d0-3dcc-429e-b2f8-bae8a261b366	-6	80	74	Play on server Ariuan's Server	2026-05-04 14:03:41.271	658305794038825030	1	\N	\N	\N
89cf044a-a1a4-46c0-b5d1-be5719581d33	-6	346	340	Play on server Ariuan's Server	2026-05-04 14:05:33.637	844193954756689921	1	\N	\N	\N
7122496e-b4dc-4d36-bb68-09e7570603e6	-6	74	68	Play on server Ariuan's Server	2026-05-04 14:12:02.581	658305794038825030	1	\N	\N	\N
541141dc-4fef-4e0d-afd8-48a3dc2e3ac6	-6	340	334	Play on server Ariuan's Server	2026-05-04 14:13:54.907	844193954756689921	1	\N	\N	\N
987a5261-1534-4f0b-b98b-4a30deadcec9	-6	68	62	Play on server Ariuan's Server	2026-05-04 14:18:11.712	658305794038825030	1	\N	\N	\N
9dac240c-69fd-48ee-8e02-0d02f3b6008d	-6	334	328	Play on server Ariuan's Server	2026-05-04 14:22:14.928	844193954756689921	1	\N	\N	\N
ef5d3c29-c0bc-4611-96cd-558548c55c7b	-6	328	322	Play on server Ariuan's Server	2026-05-04 14:30:34.897	844193954756689921	1	\N	\N	\N
549038a9-9ef0-41e8-aace-c34eb104f33a	-6	322	316	Play on server Ariuan's Server	2026-05-04 14:38:54.898	844193954756689921	1	\N	\N	\N
55cf7ce9-6cd2-4117-8d33-9b1725784660	-6	316	310	Play on server Ariuan's Server	2026-05-04 14:47:14.906	844193954756689921	1	\N	\N	\N
2028a05b-46c7-46fe-8a35-02bb188a8371	-6	310	304	Play on server Ariuan's Server	2026-05-04 14:55:34.924	844193954756689921	1	\N	\N	\N
c076aa1a-9e02-4686-9d14-7cf8be12dae2	-6	523	517	Play on server Ariuan's Server	2026-05-04 15:01:26.75	709605543358234674	1	\N	\N	\N
3605ba0d-c9f4-47cc-9852-091f7c33336d	-6	304	298	Play on server Ariuan's Server	2026-05-04 15:03:54.911	844193954756689921	1	\N	\N	\N
b9ee0fad-1168-4d12-9e03-20cad82a7f5f	-6	517	511	Play on server Ariuan's Server	2026-05-04 15:09:21.471	709605543358234674	1	\N	\N	\N
c28f5f01-145f-4bb3-9c93-a24666e28ad3	-6	298	292	Play on server Ariuan's Server	2026-05-04 15:12:14.919	844193954756689921	1	\N	\N	\N
408dd8db-1cf3-4267-b5bf-1a26af216046	-6	511	505	Play on server Ariuan's Server	2026-05-04 15:17:41.474	709605543358234674	1	\N	\N	\N
8bcad928-b43b-4043-96de-f34bb3b26f62	-6	292	286	Play on server Ariuan's Server	2026-05-04 15:20:34.928	844193954756689921	1	\N	\N	\N
ba9e1aea-3b89-4925-854a-0e3d0a38ae2f	-6	505	499	Play on server Ariuan's Server	2026-05-04 15:26:01.475	709605543358234674	1	\N	\N	\N
fa19cd2d-7a2e-4eb0-88f9-b141de3f6ebc	-6	286	280	Play on server Ariuan's Server	2026-05-04 15:28:54.926	844193954756689921	1	\N	\N	\N
4b01895b-21a7-4806-ae47-4b3371bad9bd	-6	499	493	Play on server Ariuan's Server	2026-05-04 15:34:21.48	709605543358234674	1	\N	\N	\N
ec0c2df7-b5af-4cc0-a1dc-975ff8880ec6	-6	280	274	Play on server Ariuan's Server	2026-05-04 15:37:14.932	844193954756689921	1	\N	\N	\N
cc3ee56e-4d60-4ff5-b99e-38fe9c5219e8	-6	493	487	Play on server Ariuan's Server	2026-05-04 15:42:41.488	709605543358234674	1	\N	\N	\N
10bbb639-83d4-4696-ada7-11169c33c4ad	-6	274	268	Play on server Ariuan's Server	2026-05-04 15:43:46.284	844193954756689921	1	\N	\N	\N
d4346e5f-f229-48ce-af41-6bce50cdda3a	-6	62	56	Play on server Ariuan's Server	2026-05-04 15:46:20.845	658305794038825030	1	\N	\N	\N
9d77d8e8-100e-4585-b61e-e87d47dd806f	-6	487	481	Play on server Ariuan's Server	2026-05-04 15:51:01.49	709605543358234674	1	\N	\N	\N
8202ff22-c1bc-42d6-896a-2bc03f4a06c1	-6	268	262	Play on server Ariuan's Server	2026-05-04 15:52:06.287	844193954756689921	1	\N	\N	\N
b263b4fb-f261-4116-b6fe-b6c99087ee49	-6	56	50	Play on server Ariuan's Server	2026-05-04 15:54:40.853	658305794038825030	1	\N	\N	\N
ef3809d2-eae6-401b-b9f1-99f0bc66fcdf	100	196	296	Daily Gift	2026-05-18 06:00:09.241	658305794038825030	\N	\N	\N	\N
f67f849d-900e-42dc-a527-166f9d763c51	-6	481	475	Play on server Ariuan's Server	2026-05-04 15:59:21.494	709605543358234674	1	\N	\N	\N
93a4025c-3a4b-41cc-9e0c-8c8a1d2de9e8	-6	262	256	Play on server Ariuan's Server	2026-05-04 16:00:26.283	844193954756689921	1	\N	\N	\N
1449c77e-82a4-421e-a22e-84cf8f3c1148	-6	50	44	Play on server Ariuan's Server	2026-05-04 16:01:08.737	658305794038825030	1	\N	\N	\N
578d9d10-8b91-4cc4-beeb-abdd628bc042	-6	228	222	Play on server Ariuan's Server	2026-05-04 16:04:02.573	780972375394091009	1	\N	\N	\N
b96c9e56-02a4-4dde-8d41-f0a6565bd958	-88	222	134	Someone reported you	2026-05-04 16:07:00.788	780972375394091009	\N	\N	\N	\N
d6492ac0-39a8-4fa6-87fa-d8451a125b75	-6	475	469	Play on server Ariuan's Server	2026-05-04 16:07:41.499	709605543358234674	1	\N	\N	\N
c8d5864a-457a-4a7c-a8fa-8355bc6fbc1c	-6	256	250	Play on server Ariuan's Server	2026-05-04 16:08:46.285	844193954756689921	1	\N	\N	\N
13417595-2d9b-4b52-a010-742dad5e17fb	-6	44	38	Play on server Ariuan's Server	2026-05-04 16:08:58.051	658305794038825030	1	\N	\N	\N
d593f807-cdb7-477b-99d3-864804f20649	-6	134	128	Play on server Ariuan's Server	2026-05-04 16:12:22.597	780972375394091009	1	\N	\N	\N
d5dbde7e-5326-4039-be69-0f0e2ea55a86	-6	469	463	Play on server Ariuan's Server	2026-05-04 16:16:01.503	709605543358234674	1	\N	\N	\N
48cc928b-1e89-4a12-b16a-2a49e3ce3eed	-6	250	244	Play on server Ariuan's Server	2026-05-04 16:17:06.297	844193954756689921	1	\N	\N	\N
81fb86da-bbe4-467b-b41b-e89788397d01	-6	38	32	Play on server Ariuan's Server	2026-05-04 16:18:10.855	658305794038825030	1	\N	\N	\N
0d4a2298-c488-471c-a6d1-ef0b72ccc3a6	-6	128	122	Play on server Ariuan's Server	2026-05-04 16:20:42.606	780972375394091009	1	\N	\N	\N
814e6b87-afaf-4252-bda1-a390b1756348	-6	463	457	Play on server Ariuan's Server	2026-05-04 16:24:21.502	709605543358234674	1	\N	\N	\N
37f467d5-2a6b-4348-ace4-b6a1bd64b764	-6	244	238	Play on server Ariuan's Server	2026-05-04 16:25:26.292	844193954756689921	1	\N	\N	\N
62820521-72d9-4ea5-854b-2683b7b5273b	-6	32	26	Play on server Ariuan's Server	2026-05-04 16:26:30.852	658305794038825030	1	\N	\N	\N
8c42183d-c71d-48a7-9df2-46ad3d253a2c	-6	122	116	Play on server Ariuan's Server	2026-05-04 16:29:02.602	780972375394091009	1	\N	\N	\N
b88e7851-052c-4a53-8651-601cc51f7b96	-6	457	451	Play on server Ariuan's Server	2026-05-04 16:32:41.502	709605543358234674	1	\N	\N	\N
dee7a96d-b50b-4955-9f37-a826b21badd5	-6	238	232	Play on server Ariuan's Server	2026-05-04 16:33:46.306	844193954756689921	1	\N	\N	\N
97643fb9-12f9-4d4e-900f-0c2e177a6325	-6	26	20	Play on server Ariuan's Server	2026-05-04 16:34:50.857	658305794038825030	1	\N	\N	\N
b68fc75e-7894-4246-8686-752b04e58e55	-6	116	110	Play on server Ariuan's Server	2026-05-04 16:37:22.738	780972375394091009	1	\N	\N	\N
24af5a59-f97f-4fc5-a507-0d7435b8485f	-6	451	445	Play on server Ariuan's Server	2026-05-04 16:38:41.041	709605543358234674	1	\N	\N	\N
618c908d-8cc8-40cc-8b02-b26b3d14f951	-6	232	226	Play on server Ariuan's Server	2026-05-04 16:42:06.376	844193954756689921	1	\N	\N	\N
51ea8ed3-8862-488c-8621-8227bb95bee4	-6	110	104	Play on server Ariuan's Server	2026-05-04 16:45:43.06	780972375394091009	1	\N	\N	\N
0fab8b00-c195-4110-9d94-b3ef77934c0c	-6	445	439	Play on server Ariuan's Server	2026-05-04 16:47:01.406	709605543358234674	1	\N	\N	\N
e329a13f-21ec-4cd2-b4f8-7e6b1c4ed706	-6	226	220	Play on server Ariuan's Server	2026-05-04 16:50:26.756	844193954756689921	1	\N	\N	\N
9dd5feb8-28d8-40c0-96da-7b40797033f8	-6	104	98	Play on server Ariuan's Server	2026-05-04 16:54:03.06	780972375394091009	1	\N	\N	\N
206f0b2c-f7c7-4a27-8def-7660160d543b	-6	439	433	Play on server Ariuan's Server	2026-05-04 16:55:21.407	709605543358234674	1	\N	\N	\N
c3735f3a-0289-4b48-a6f9-58089938af2e	-6	220	214	Play on server Ariuan's Server	2026-05-04 16:58:46.75	844193954756689921	1	\N	\N	\N
04891815-1b83-415a-9b47-f2cbbb5bb6e1	-6	98	92	Play on server Ariuan's Server	2026-05-04 17:02:23.055	780972375394091009	1	\N	\N	\N
956a3297-2020-442b-9ad3-73c45eaa2841	-6	433	427	Play on server Ariuan's Server	2026-05-04 17:03:41.401	709605543358234674	1	\N	\N	\N
8590b151-9380-4e53-b1a3-d4ec616c82b1	-6	214	208	Play on server Ariuan's Server	2026-05-04 17:07:06.745	844193954756689921	1	\N	\N	\N
0117f824-bda0-4002-a972-7992976fce4e	-6	92	86	Play on server Ariuan's Server	2026-05-04 17:10:43.065	780972375394091009	1	\N	\N	\N
a0e4763e-a3b8-4c4d-b9e5-e8cf310bf731	-6	208	202	Play on server Ariuan's Server	2026-05-04 17:15:26.754	844193954756689921	1	\N	\N	\N
ff4bd513-9514-4387-acd8-e20fd76429ea	-6	86	80	Play on server Ariuan's Server	2026-05-04 17:19:03.057	780972375394091009	1	\N	\N	\N
1ff0690e-8d5c-4988-8f11-75a655a7f9f5	-6	202	196	Play on server Ariuan's Server	2026-05-04 17:23:46.738	844193954756689921	1	\N	\N	\N
d07a9a9a-7732-441d-baf8-847b5f15d75a	-6	80	74	Play on server Ariuan's Server	2026-05-04 17:27:23.065	780972375394091009	1	\N	\N	\N
e657a2b3-9e9f-46da-ac01-41aae260dadb	2	196	198	工費	2026-05-04 17:31:54.275	844193954756689921	\N	\N	\N	\N
c850dddf-1884-431b-84c6-19041716766a	-6	198	192	Play on server Ariuan's Server	2026-05-04 17:32:06.757	844193954756689921	1	\N	\N	\N
27229973-150d-4256-8a1d-a1ff043dd036	-6	74	68	Play on server Ariuan's Server	2026-05-04 17:35:43.067	780972375394091009	1	\N	\N	\N
0c0f56eb-7e65-40cc-8144-f77c0cfddb91	-6	192	186	Play on server Ariuan's Server	2026-05-04 17:39:23.204	844193954756689921	1	\N	\N	\N
4911130c-ca89-46df-a162-2daf583e640d	-6	68	62	Play on server Ariuan's Server	2026-05-04 17:44:03.066	780972375394091009	1	\N	\N	\N
fef33eec-4ff3-42e6-bfe7-94a5100129d7	-6	186	180	Play on server Ariuan's Server	2026-05-04 17:47:43.217	844193954756689921	1	\N	\N	\N
01061aa0-bc25-4836-9a29-f20478c8207b	-6	62	56	Play on server Ariuan's Server	2026-05-04 17:52:23.105	780972375394091009	1	\N	\N	\N
5e39d2c8-e7aa-4385-8f2e-db98bac28359	-6	180	174	Play on server Ariuan's Server	2026-05-04 17:56:03.257	844193954756689921	1	\N	\N	\N
3d99174c-76af-45db-b4c8-dcaf5b3c72f8	-6	56	50	Play on server Ariuan's Server	2026-05-04 18:00:43.208	780972375394091009	1	\N	\N	\N
b816e9aa-4fc5-43b0-9df4-bcb551ecc424	-6	174	168	Play on server Ariuan's Server	2026-05-04 18:04:23.396	844193954756689921	1	\N	\N	\N
62669961-7567-4a10-9d4b-1511258cdd03	-6	50	44	Play on server Ariuan's Server	2026-05-04 18:09:03.17	780972375394091009	1	\N	\N	\N
ffe78250-efdd-42fa-bb31-1b07aab22555	-6	168	162	Play on server Ariuan's Server	2026-05-04 18:12:43.329	844193954756689921	1	\N	\N	\N
a9135609-91f6-4e46-8cd3-6429c41312ca	-6	44	38	Play on server Ariuan's Server	2026-05-04 18:17:21.469	780972375394091009	1	\N	\N	\N
8eb9ee51-d466-4fc7-b9ff-b4f16660f619	-6	162	156	Play on server Ariuan's Server	2026-05-04 18:21:03.341	844193954756689921	1	\N	\N	\N
6e7647aa-ff73-4ee1-a75a-e6fb83f77f27	-6	38	32	Play on server Ariuan's Server	2026-05-04 18:25:41.393	780972375394091009	1	\N	\N	\N
b3f92623-85f0-4a08-bc0d-f98fdacc0545	-6	156	150	Play on server Ariuan's Server	2026-05-04 18:29:23.23	844193954756689921	1	\N	\N	\N
5174b68c-b5f4-4e33-8387-4b82cfb71203	-6	32	26	Play on server Ariuan's Server	2026-05-04 18:34:01.384	780972375394091009	1	\N	\N	\N
6607afa9-f37b-4425-98ce-eab536ae77c2	-6	150	144	Play on server Ariuan's Server	2026-05-04 18:37:43.233	844193954756689921	1	\N	\N	\N
5c038b5f-9650-4ad6-a1ee-bab901e16358	-6	26	20	Play on server Ariuan's Server	2026-05-04 18:42:21.383	780972375394091009	1	\N	\N	\N
296d9c00-a8ec-4b3d-b523-6e07b6fe3d95	-6	144	138	Play on server Ariuan's Server	2026-05-04 18:46:03.231	844193954756689921	1	\N	\N	\N
c2d3b0e5-aa57-40a6-ac68-3e33a8eb5f19	-6	20	14	Play on server Ariuan's Server	2026-05-04 18:50:41.374	780972375394091009	1	\N	\N	\N
c19395eb-1748-4616-bf7f-8901963294d8	-6	138	132	Play on server Ariuan's Server	2026-05-04 18:54:23.224	844193954756689921	1	\N	\N	\N
ead0307d-ad58-43e5-85f8-18ee06620d8c	-6	14	8	Play on server Ariuan's Server	2026-05-04 18:59:01.378	780972375394091009	1	\N	\N	\N
738e72d5-bb3f-4b9a-922e-a67e12ebde86	-6	132	126	Play on server Ariuan's Server	2026-05-04 19:02:43.291	844193954756689921	1	\N	\N	\N
9d215a10-ba19-49ba-a4cb-d13c7cba5e90	-6	8	2	Play on server Ariuan's Server	2026-05-04 19:07:21.444	780972375394091009	1	\N	\N	\N
bc7d341c-b6cb-4164-83b3-43b3c85bc164	-6	126	120	Play on server Ariuan's Server	2026-05-04 19:11:03.311	844193954756689921	1	\N	\N	\N
3587db5b-b10e-4511-96d9-4d661c1744b0	-6	120	114	Play on server Ariuan's Server	2026-05-04 19:19:23.309	844193954756689921	1	\N	\N	\N
79ad3010-c677-47ec-81ba-334103dbd4d3	-6	114	108	Play on server Ariuan's Server	2026-05-04 19:27:43.308	844193954756689921	1	\N	\N	\N
20159cdb-27ef-4f1b-9f2a-80d01b75fd87	100	2	102	Daily Gift	2026-05-05 06:00:03.532	780972375394091009	\N	\N	\N	\N
6954ec43-15df-4675-a70a-dfcab06736e3	100	108	208	Daily Gift	2026-05-05 06:00:04.548	844193954756689921	\N	\N	\N	\N
27c20327-64ad-4160-a6ea-85977bfec5c1	100	20	120	Daily Gift	2026-05-05 06:00:05.107	658305794038825030	\N	\N	\N	\N
b44c463f-d808-45ad-ae2d-7b5f1c7a8efc	-30	102	72	New Start Server Poll (Using Ticket(s): `Witch Farm Builder`, saved 0 credits)	2026-05-05 06:29:01.455	780972375394091009	1	\N	\N	\N
1542bf06-b685-4e8e-a877-ada13d79dcc6	-15	72	57	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-05-05 06:29:19.098	780972375394091009	1	\N	\N	\N
f7667037-15b5-49c8-ab4d-6a6fa3ca1e01	15	57	72	Approval Reaction Refund	2026-05-05 06:32:11.902	780972375394091009	1	\N	\N	\N
9f277989-1e9a-4e90-9936-5509a8bb61da	-30	72	42	New Start Server Poll (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-05-05 06:32:45.533	780972375394091009	1	\N	\N	\N
6fd95a27-fc70-4337-a2b0-ef7b63cedff3	-15	42	27	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-05-05 06:33:00.076	780972375394091009	1	\N	\N	\N
16fb4d72-9120-414b-847b-8db31d870ae6	-6	208	202	Play on server Ariuan's Server	2026-05-05 07:37:13.23	844193954756689921	1	\N	\N	\N
06f6a812-ef9b-45af-9a96-1e2a027a01c1	-6	202	196	Play on server Ariuan's Server	2026-05-05 07:45:35.637	844193954756689921	1	\N	\N	\N
37686d1a-d7b3-4d38-8275-20998b93d195	-6	196	190	Play on server Ariuan's Server	2026-05-05 07:53:55.629	844193954756689921	1	\N	\N	\N
f7ecde61-e685-4848-ab0a-d3ba8957d504	-6	190	184	Play on server Ariuan's Server	2026-05-05 08:02:15.634	844193954756689921	1	\N	\N	\N
e4fa0fc1-fb52-49d6-892f-ae54d44845c6	-6	184	178	Play on server Ariuan's Server	2026-05-05 08:10:35.641	844193954756689921	1	\N	\N	\N
7fe959fd-fc6f-49db-88ce-57de67db14d1	-6	178	172	Play on server Ariuan's Server	2026-05-05 08:18:55.625	844193954756689921	1	\N	\N	\N
f8fc01ad-4038-4986-ba39-22b9cfc8898a	-6	172	166	Play on server Ariuan's Server	2026-05-05 08:27:15.643	844193954756689921	1	\N	\N	\N
b31472ed-95a3-4114-a7d1-57dc660be4ca	-6	166	160	Play on server Ariuan's Server	2026-05-05 08:35:35.645	844193954756689921	1	\N	\N	\N
7b1ca5e4-9bdc-427b-ad25-a37fbcc8d0c4	-6	160	154	Play on server Ariuan's Server	2026-05-05 08:43:55.633	844193954756689921	1	\N	\N	\N
e6505b04-9ad2-441a-a98e-e16ad6eb7fd4	-6	154	148	Play on server Ariuan's Server	2026-05-05 08:52:15.653	844193954756689921	1	\N	\N	\N
69019267-22d4-4cec-9bb6-aec379d3c26d	-6	148	142	Play on server Ariuan's Server	2026-05-05 09:00:35.659	844193954756689921	1	\N	\N	\N
e93d7322-c48e-4fd9-8ff2-e1d212d3922a	-6	142	136	Play on server Ariuan's Server	2026-05-05 09:08:55.643	844193954756689921	1	\N	\N	\N
2261b761-d3b3-4f4d-bfa7-3f6050185a04	-6	136	130	Play on server Ariuan's Server	2026-05-05 09:17:15.612	844193954756689921	1	\N	\N	\N
f48a131a-2992-486c-b545-16de257c5233	-6	130	124	Play on server Ariuan's Server	2026-05-05 09:25:35.611	844193954756689921	1	\N	\N	\N
58696bfe-5306-444f-90c3-40b99ab4c842	-6	124	118	Play on server Ariuan's Server	2026-05-05 09:33:55.613	844193954756689921	1	\N	\N	\N
b5ef96ed-87ef-459f-a423-b7f86391b5f1	-6	118	112	Play on server Ariuan's Server	2026-05-05 09:42:15.616	844193954756689921	1	\N	\N	\N
12594a87-0d55-4a27-af61-053a49702fef	-6	112	106	Play on server Ariuan's Server	2026-05-05 09:50:35.613	844193954756689921	1	\N	\N	\N
eb574fed-39a5-426e-9c63-0b94df0af265	-6	106	100	Play on server Ariuan's Server	2026-05-05 09:58:55.591	844193954756689921	1	\N	\N	\N
fb8978dc-d936-498a-b38c-2ac53f578cb2	-6	100	94	Play on server Ariuan's Server	2026-05-05 10:07:15.607	844193954756689921	1	\N	\N	\N
f2de5cd0-1158-4096-985e-07b18c383efd	-6	94	88	Play on server Ariuan's Server	2026-05-05 10:15:35.602	844193954756689921	1	\N	\N	\N
725a1c51-b988-4b4e-bb06-36602ec00f4c	-6	88	82	Play on server Ariuan's Server	2026-05-05 10:23:55.589	844193954756689921	1	\N	\N	\N
982edfee-d3e6-4e49-8618-5fbbecc64437	-6	82	76	Play on server Ariuan's Server	2026-05-05 10:32:15.605	844193954756689921	1	\N	\N	\N
b2abd322-a4d7-460f-aa41-fc2ec011033a	-6	76	70	Play on server Ariuan's Server	2026-05-05 10:38:44.199	844193954756689921	1	\N	\N	\N
dbafb16d-423d-477b-b0d9-1d91a47e4c79	-6	70	64	Play on server Ariuan's Server	2026-05-05 10:47:04.254	844193954756689921	1	\N	\N	\N
b3ada7fe-20fe-4f51-8bb2-89a43599bdba	-6	64	58	Play on server Ariuan's Server	2026-05-05 10:55:24.276	844193954756689921	1	\N	\N	\N
21096c77-48e1-498b-829b-9724ce28d53e	-6	58	52	Play on server Ariuan's Server	2026-05-05 11:03:44.287	844193954756689921	1	\N	\N	\N
0f928210-a3bb-4d1e-bb74-37af776d4146	-6	52	46	Play on server Ariuan's Server	2026-05-05 11:12:04.296	844193954756689921	1	\N	\N	\N
a6ab7e20-41c7-45fa-8c3f-084c0ba626de	100	120	220	Daily Gift	2026-05-06 06:00:04.064	658305794038825030	\N	\N	\N	\N
1fe26746-cef5-4c8b-9ef6-d39149f8895f	100	27	127	Daily Gift	2026-05-06 06:00:04.668	780972375394091009	\N	\N	\N	\N
56289fd9-6b7b-4a39-887a-c1a139441746	100	46	146	Daily Gift	2026-05-06 06:00:05.204	844193954756689921	\N	\N	\N	\N
477205d2-bdff-484c-90ef-139fe3727f6d	100	0	100	Daily Gift	2026-05-18 06:00:09.81	844193954756689921	\N	\N	\N	\N
69e430c9-60e9-4596-a0df-bca077d9ac8f	-30	127	97	New Start Server Poll (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-05-06 09:06:28.842	780972375394091009	1	\N	\N	\N
63050ac5-48ec-4fd6-a37a-973f61b133fd	-15	97	82	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-05-06 09:06:45.321	780972375394091009	1	\N	\N	\N
8adf0d3a-beba-4e9b-9a31-95b6df97b446	-6	146	140	Play on server Ariuan's Server	2026-05-06 09:12:12.992	844193954756689921	1	\N	\N	\N
94ae58d2-e728-45e9-b54e-2636a6e923ba	-6	140	134	Play on server Ariuan's Server	2026-05-06 09:20:32.953	844193954756689921	1	\N	\N	\N
991fb713-bb94-42ea-96b8-615e0cfc4a1a	-6	134	128	Play on server Ariuan's Server	2026-05-06 09:28:52.953	844193954756689921	1	\N	\N	\N
a203c0a7-8951-4a0b-bc29-eea82e0b7438	-6	128	122	Play on server Ariuan's Server	2026-05-06 09:37:13.001	844193954756689921	1	\N	\N	\N
8c43f646-d4b4-4a98-b665-59cd4250f46e	-6	122	116	Play on server Ariuan's Server	2026-05-06 09:45:33.006	844193954756689921	1	\N	\N	\N
52ec7c39-bcf3-42d0-bb53-90fb756d5c59	-6	116	110	Play on server Ariuan's Server	2026-05-06 09:53:52.985	844193954756689921	1	\N	\N	\N
7433dbc0-ee7c-4fab-ad25-480328cd8035	-6	110	104	Play on server Ariuan's Server	2026-05-06 10:02:13.016	844193954756689921	1	\N	\N	\N
ff30f360-3483-4b6c-8b28-4b306f312447	-6	104	98	Play on server Ariuan's Server	2026-05-06 10:10:32.991	844193954756689921	1	\N	\N	\N
9f248e6a-55ce-4ceb-88dd-800b12e131cc	-6	98	92	Play on server Ariuan's Server	2026-05-06 10:18:52.97	844193954756689921	1	\N	\N	\N
5e16cc4d-d7b0-443f-ace5-d10025d0b5f6	-6	92	86	Play on server Ariuan's Server	2026-05-06 10:27:13.017	844193954756689921	1	\N	\N	\N
c57a645c-0414-4157-bf01-54a3c8815503	-6	86	80	Play on server Ariuan's Server	2026-05-06 10:35:32.999	844193954756689921	1	\N	\N	\N
f314c9e9-99dd-4703-a678-05f0548ba820	-6	80	74	Play on server Ariuan's Server	2026-05-06 10:43:52.974	844193954756689921	1	\N	\N	\N
d05b8a9a-58ee-414a-8cb7-425a3597c982	-6	74	68	Play on server Ariuan's Server	2026-05-06 10:52:12.996	844193954756689921	1	\N	\N	\N
c4646511-0b7c-43d0-bb3c-eda60fcfcb18	-6	68	62	Play on server Ariuan's Server	2026-05-06 11:00:32.992	844193954756689921	1	\N	\N	\N
3c426bf2-8f9f-4484-9eee-a71d47845edf	-6	62	56	Play on server Ariuan's Server	2026-05-06 11:08:52.984	844193954756689921	1	\N	\N	\N
62b51cb6-f1da-4010-962a-04b2df14fd4b	-6	220	214	Play on server Ariuan's Server	2026-05-06 11:12:22.107	658305794038825030	1	\N	\N	\N
4ef43612-476d-45d4-b464-32c6b7163bc7	-6	56	50	Play on server Ariuan's Server	2026-05-06 11:15:46.64	844193954756689921	1	\N	\N	\N
8267ecb8-ff93-415d-979f-ad149824717f	-6	214	208	Play on server Ariuan's Server	2026-05-06 11:20:42.136	658305794038825030	1	\N	\N	\N
295110fb-9868-41cb-8c16-38a3ab6b72b0	-6	50	44	Play on server Ariuan's Server	2026-05-06 11:24:06.661	844193954756689921	1	\N	\N	\N
0a217eea-507c-4042-bf61-3054e2a87521	-6	44	38	Play on server Ariuan's Server	2026-05-06 11:32:26.65	844193954756689921	1	\N	\N	\N
4dab4008-55c1-44ba-9113-c510b7497eed	-6	38	32	Play on server Ariuan's Server	2026-05-06 11:40:46.678	844193954756689921	1	\N	\N	\N
1899ecfa-40fd-48f9-8297-e5872ab2cc45	-6	32	26	Play on server Ariuan's Server	2026-05-06 11:45:48.905	844193954756689921	1	\N	\N	\N
ace238f0-4ff9-493f-818a-4a0444dbeee3	-6	26	20	Play on server Ariuan's Server	2026-05-06 11:51:19.326	844193954756689921	1	\N	\N	\N
9568a6bf-7fd2-415e-b2d4-6613df68c197	-6	20	14	Play on server Ariuan's Server	2026-05-06 11:59:36.158	844193954756689921	1	\N	\N	\N
242d011e-eaca-4ed5-a6fc-539dcdde2243	-6	14	8	Play on server Ariuan's Server	2026-05-06 12:04:52.589	844193954756689921	1	\N	\N	\N
22239887-2837-4134-8432-a86ccb41fe73	-6	82	76	Play on server Ariuan's Server	2026-05-06 14:32:24.495	780972375394091009	1	\N	\N	\N
8ee03225-0321-45fb-a903-4b9f9bfd2263	-6	76	70	Play on server Ariuan's Server	2026-05-06 14:40:44.521	780972375394091009	1	\N	\N	\N
f8202132-8801-40c3-a36e-118e28066b27	-6	70	64	Play on server Ariuan's Server	2026-05-06 14:49:04.517	780972375394091009	1	\N	\N	\N
42ed24d9-503e-4cf1-b2eb-48bf6bb339bf	-6	64	58	Play on server Ariuan's Server	2026-05-06 14:57:24.523	780972375394091009	1	\N	\N	\N
c8756752-7ce6-427e-976e-ec8967fbcc55	-6	58	52	Play on server Ariuan's Server	2026-05-06 15:05:44.403	780972375394091009	1	\N	\N	\N
33ce9e0a-b876-40f5-b7b4-4ec3c108b684	-6	52	46	Play on server Ariuan's Server	2026-05-06 15:14:04.394	780972375394091009	1	\N	\N	\N
30e5086f-b843-4df5-80d9-c5b99ca98847	-6	46	40	Play on server Ariuan's Server	2026-05-06 15:22:24.397	780972375394091009	1	\N	\N	\N
df78acf1-6757-412a-b603-4d44e6e9e25f	-6	40	34	Play on server Ariuan's Server	2026-05-06 15:30:44.365	780972375394091009	1	\N	\N	\N
8358580f-6dcb-4eab-96ca-d63385377f03	-6	34	28	Play on server Ariuan's Server	2026-05-06 15:39:04.362	780972375394091009	1	\N	\N	\N
9044eae1-78d0-4fa8-8fec-06ad782588ea	-6	427	421	Play on server Ariuan's Server	2026-05-06 15:49:09.63	709605543358234674	1	\N	\N	\N
6f188f60-f8d8-42a4-a113-649ba8ca3523	-6	208	202	Play on server Ariuan's Server	2026-05-06 15:51:10.796	658305794038825030	1	\N	\N	\N
302eb8c5-8196-4902-9200-b5f927f13c00	-6	421	415	Play on server Ariuan's Server	2026-05-06 15:57:29.627	709605543358234674	1	\N	\N	\N
4a0553bb-07cf-41a5-b7b2-28ad3ce47356	-6	415	409	Play on server Ariuan's Server	2026-05-06 16:05:49.635	709605543358234674	1	\N	\N	\N
3a17b79c-93f9-4e55-aab5-900e16961b01	-6	28	22	Play on server Ariuan's Server	2026-05-06 16:12:55.071	780972375394091009	1	\N	\N	\N
a94aeea8-5c03-467e-861b-9e176a1edcd2	-6	409	403	Play on server Ariuan's Server	2026-05-06 16:14:09.607	709605543358234674	1	\N	\N	\N
b66513a0-4333-42bd-8b55-6a97b0f7b445	-6	22	16	Play on server Ariuan's Server	2026-05-06 16:21:57.62	780972375394091009	1	\N	\N	\N
32743fb5-b77b-4cc8-8664-fc764f002271	-6	403	397	Play on server Ariuan's Server	2026-05-06 16:22:29.604	709605543358234674	1	\N	\N	\N
1faae958-0e34-4a39-939c-e05a641fa755	-6	16	10	Play on server Ariuan's Server	2026-05-06 16:30:17.609	780972375394091009	1	\N	\N	\N
d47d9abb-49ed-4a8c-b322-6fbc35aa71da	-6	397	391	Play on server Ariuan's Server	2026-05-06 16:30:49.605	709605543358234674	1	\N	\N	\N
fabc26c0-c0ed-4258-92f0-3b262353a6be	100	8	108	Daily Gift	2026-05-07 06:00:04.438	844193954756689921	\N	\N	\N	\N
4f6a3020-9715-4c40-9947-7bb5ac2cbffe	100	10	110	Daily Gift	2026-05-07 06:00:07.033	780972375394091009	\N	\N	\N	\N
795a0498-9ba0-428e-b2d6-454376324cea	-30	110	80	New Start Server Poll	2026-05-07 08:37:27.825	780972375394091009	1	\N	\N	\N
69d576e0-5af2-44cc-9ee2-94c32f1a9bec	-30	80	50	New Start Server Poll (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-05-07 08:38:03.348	780972375394091009	1	\N	\N	\N
d777714a-565a-4b02-b5b1-202ef116e27d	-15	50	35	Approval Poll Reaction: Start Server at Ariuan's Server (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-05-07 08:39:07.796	780972375394091009	1	\N	\N	\N
56a04f49-b58f-49b6-8324-58af9296c6f8	-6	35	29	Play on server Ariuan's Server	2026-05-07 12:40:02.199	780972375394091009	1	\N	\N	\N
ae9e6d6e-3e29-4d71-a6ac-8c694dd0afb4	100	108	208	Daily Gift	2026-05-08 06:00:04.757	844193954756689921	\N	\N	\N	\N
6ec95dc9-755e-4b7d-aa5d-7f8cd8b710dd	100	29	129	Daily Gift	2026-05-08 06:00:05.415	780972375394091009	\N	\N	\N	\N
adad1e17-0cb2-454d-9bbf-1567ed259f3b	-30	129	99	New Start Server Poll (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-05-08 07:43:09.529	780972375394091009	1	\N	\N	\N
871c0241-a585-4220-b3c2-af3c7afa0e68	-15	99	84	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-08 07:43:26.324	780972375394091009	1	\N	\N	\N
cbb4a928-64a6-4a02-8114-82c02c2932ac	-6	84	78	Play on server Ariuan's Server	2026-05-08 07:46:28.474	780972375394091009	1	\N	\N	\N
7143c5c3-546d-46d4-80f0-2ef3e16bd8cb	-6	78	72	Play on server Ariuan's Server	2026-05-08 07:54:48.503	780972375394091009	1	\N	\N	\N
b1cf483b-7e8a-4575-bf94-e36f02127c8d	-6	72	66	Play on server Ariuan's Server	2026-05-08 08:03:08.517	780972375394091009	1	\N	\N	\N
0125123e-e516-4b5a-ad15-6072054473ec	-6	66	60	Play on server Ariuan's Server	2026-05-08 08:11:28.599	780972375394091009	1	\N	\N	\N
41559f17-c184-4ada-afbf-2138d4884bbd	-6	60	54	Play on server Ariuan's Server	2026-05-08 08:19:48.508	780972375394091009	1	\N	\N	\N
a8ae342b-a827-4a1a-bb70-025185e56855	-6	54	48	Play on server Ariuan's Server	2026-05-08 08:25:58.349	780972375394091009	1	\N	\N	\N
33b704fa-cc08-4181-96fb-c08d939259c2	-6	48	42	Play on server Ariuan's Server	2026-05-08 08:34:18.329	780972375394091009	1	\N	\N	\N
78dc834a-a729-4194-a8da-5ec41701fb19	-6	42	36	Play on server Ariuan's Server	2026-05-08 08:42:38.353	780972375394091009	1	\N	\N	\N
b2544159-315a-4656-927f-04796943158e	-6	36	30	Play on server Ariuan's Server	2026-05-08 08:50:58.351	780972375394091009	1	\N	\N	\N
5f5513bd-1378-463e-a378-bf9cf7d4657c	-6	30	24	Play on server Ariuan's Server	2026-05-08 08:59:18.336	780972375394091009	1	\N	\N	\N
1b87f2c4-c5e8-45ad-ad83-1c299f7f925c	-6	24	18	Play on server Ariuan's Server	2026-05-08 09:07:38.345	780972375394091009	1	\N	\N	\N
e9bc3790-0cd2-4190-a9af-d07e243a2998	-6	18	12	Play on server Ariuan's Server	2026-05-08 09:15:58.343	780972375394091009	1	\N	\N	\N
8cbcd3ab-d9c5-46e1-98e4-9f1f816a1526	-6	12	6	Play on server Ariuan's Server	2026-05-08 09:24:18.337	780972375394091009	1	\N	\N	\N
0ac0ab0e-dfd1-4035-a903-2c631a43e2b7	-6	6	0	Play on server Ariuan's Server	2026-05-08 09:32:38.364	780972375394091009	1	\N	\N	\N
da0253ea-4a0b-470e-9024-f7a6d46cab51	50	0	50	Changed by admin	2026-05-08 12:16:44.603	780972375394091009	\N	\N	\N	\N
820e349d-7bb7-49fe-83ed-9cae5fab90c4	-6	50	44	Play on server Ariuan's Server	2026-05-08 16:14:01.555	780972375394091009	1	\N	\N	\N
6417b21a-8630-4b70-8c36-4b4742be5910	-6	44	38	Play on server Ariuan's Server	2026-05-08 16:20:53.534	780972375394091009	1	\N	\N	\N
22c8b334-4faa-4467-949b-4346cc768885	-6	38	32	Play on server Ariuan's Server	2026-05-08 16:29:13.546	780972375394091009	1	\N	\N	\N
c889b542-923c-47d4-8941-d722d5b6a0c8	-6	32	26	Play on server Ariuan's Server	2026-05-08 16:37:33.613	780972375394091009	1	\N	\N	\N
d119c58e-e84c-4d40-b28b-60bdef522ea3	-6	26	20	Play on server Ariuan's Server	2026-05-08 16:45:53.606	780972375394091009	1	\N	\N	\N
f9bbc7f4-71ad-4cc2-afe4-eb230e6107a0	-6	20	14	Play on server Ariuan's Server	2026-05-08 16:54:13.621	780972375394091009	1	\N	\N	\N
da2497c9-54de-457c-811f-b58222f8e0a9	-6	14	8	Play on server Ariuan's Server	2026-05-08 17:02:33.589	780972375394091009	1	\N	\N	\N
ea6df7c6-1257-408c-bb29-755a1aa4acc1	100	8	108	Daily Gift	2026-05-09 06:00:04.823	780972375394091009	\N	\N	\N	\N
81d705c1-4dcd-4595-a75b-df2ab8bdd989	100	108	208	Daily Gift	2026-05-10 06:00:05.3	780972375394091009	\N	\N	\N	\N
4db230be-9d06-4311-9cdc-30ef0be0b943	-30	208	178	New Start Server Poll (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-05-12 12:01:57.787	780972375394091009	1	\N	\N	\N
a979ce7b-8bd7-4644-9489-455ffcba42a9	-15	178	163	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-12 12:02:14.103	780972375394091009	1	\N	\N	\N
443181e2-cf41-4241-b682-4ccfed704c82	-6	208	202	Play on server Ariuan's Server	2026-05-12 12:06:17.669	844193954756689921	1	\N	\N	\N
a62d6fe7-5b90-4f56-b591-bc1fdf95f9d0	-6	202	196	Play on server Ariuan's Server	2026-05-12 12:14:37.672	844193954756689921	1	\N	\N	\N
3edb110e-2cba-4002-ac77-61416c6b8d6a	-6	196	190	Play on server Ariuan's Server	2026-05-12 12:22:57.689	844193954756689921	1	\N	\N	\N
c59a87d9-f33d-4eb1-b1ac-4fd8d67f07eb	-6	190	184	Play on server Ariuan's Server	2026-05-12 12:31:17.687	844193954756689921	1	\N	\N	\N
a9792a88-1efd-41ca-b8cb-c19cee4aaa4f	-6	184	178	Play on server Ariuan's Server	2026-05-12 12:39:37.678	844193954756689921	1	\N	\N	\N
fd4fce74-0ab9-4e17-b265-abe1ed95dea6	-6	178	172	Play on server Ariuan's Server	2026-05-12 12:47:57.697	844193954756689921	1	\N	\N	\N
e7b88167-9351-4d63-9cd1-06452c409745	-6	172	166	Play on server Ariuan's Server	2026-05-12 12:56:17.693	844193954756689921	1	\N	\N	\N
8894a4bc-7f63-474b-9e4f-cf569178ae55	-6	166	160	Play on server Ariuan's Server	2026-05-12 13:04:37.683	844193954756689921	1	\N	\N	\N
6aad8d2f-b1e8-4c2a-80bc-0a0c26e14463	-6	160	154	Play on server Ariuan's Server	2026-05-12 13:12:57.695	844193954756689921	1	\N	\N	\N
31846872-6a82-4849-8cd1-dd1340b2ab72	-6	154	148	Play on server Ariuan's Server	2026-05-12 13:21:17.702	844193954756689921	1	\N	\N	\N
417be319-0090-4dc7-a5bd-8ae903d13ef2	-6	148	142	Play on server Ariuan's Server	2026-05-12 13:29:37.696	844193954756689921	1	\N	\N	\N
4e71512c-405d-44dc-acf1-d76ead263f05	-6	142	136	Play on server Ariuan's Server	2026-05-12 13:37:57.706	844193954756689921	1	\N	\N	\N
c464a3d7-6613-4bca-8e7c-df7c8835380a	-6	136	130	Play on server Ariuan's Server	2026-05-12 13:46:17.707	844193954756689921	1	\N	\N	\N
5b90df8d-80cb-40ba-9d77-17166b32bdc1	100	163	263	Daily Gift	2026-05-13 06:00:06.74	780972375394091009	\N	\N	\N	\N
2e24c03a-c706-477f-b21d-e3b7ced8765c	100	130	230	Daily Gift	2026-05-13 06:00:07.711	844193954756689921	\N	\N	\N	\N
8793ddb2-8436-40a1-803e-52181566a66c	-30	263	233	New Start Server Poll (Using Ticket(s): `Bye Bye DSE`, saved 0 credits)	2026-05-13 12:29:01.682	780972375394091009	1	\N	\N	\N
ec2e32eb-2b54-45fe-9bd8-54967251ee0c	-15	233	218	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-13 12:29:05.046	780972375394091009	1	\N	\N	\N
3da9feb3-19fd-49a1-88e6-def6e6e2832f	-6	230	224	Play on server Ariuan's Server	2026-05-13 12:31:15.854	844193954756689921	1	\N	\N	\N
2ce3a57e-88b0-4e44-adfd-cb894285a701	-6	224	218	Play on server Ariuan's Server	2026-05-13 12:39:35.839	844193954756689921	1	\N	\N	\N
8b37bdd4-6deb-4efa-9266-8f0cea7f6303	-6	218	212	Play on server Ariuan's Server	2026-05-13 12:47:55.838	844193954756689921	1	\N	\N	\N
a08131e3-2833-4f0d-b591-287890de9d74	-6	212	206	Play on server Ariuan's Server	2026-05-13 12:56:15.839	844193954756689921	1	\N	\N	\N
7b7d8165-4053-4203-93c0-db05e9bf7824	-6	206	200	Play on server Ariuan's Server	2026-05-13 13:04:35.842	844193954756689921	1	\N	\N	\N
8bbf1afe-cfec-41e5-8e49-8c8906e0fe7e	-6	200	194	Play on server Ariuan's Server	2026-05-13 13:12:55.847	844193954756689921	1	\N	\N	\N
05688b5b-02b1-487b-9a70-fa4341632979	-6	194	188	Play on server Ariuan's Server	2026-05-13 13:21:15.848	844193954756689921	1	\N	\N	\N
5ce6f3e3-a29f-4311-ae70-717b70578b82	-6	188	182	Play on server Ariuan's Server	2026-05-13 13:29:12.492	844193954756689921	1	\N	\N	\N
9aa7cc1f-d4c0-4052-bafd-c22efd78996c	-6	182	176	Play on server Ariuan's Server	2026-05-13 13:36:54.151	844193954756689921	1	\N	\N	\N
0a50e800-6eed-4bfd-a8cb-8eae43579e42	-6	176	170	Play on server Ariuan's Server	2026-05-13 13:45:14.155	844193954756689921	1	\N	\N	\N
f803e6df-7096-4b1c-a03b-53b44b6f7181	-6	170	164	Play on server Ariuan's Server	2026-05-13 13:53:34.155	844193954756689921	1	\N	\N	\N
2caf8023-0e1a-403f-84f4-9a4b75fe178c	-6	164	158	Play on server Ariuan's Server	2026-05-13 14:01:54.154	844193954756689921	1	\N	\N	\N
7b7489ce-0335-435f-9f0c-707af4eae432	-6	158	152	Play on server Ariuan's Server	2026-05-13 14:10:14.199	844193954756689921	1	\N	\N	\N
aab982e5-f81c-4e89-8467-e326fe4b4d30	-6	152	146	Play on server Ariuan's Server	2026-05-13 14:18:34.201	844193954756689921	1	\N	\N	\N
06dc4335-f508-4895-808a-b718db7a16ce	-6	146	140	Play on server Ariuan's Server	2026-05-13 14:27:09.601	844193954756689921	1	\N	\N	\N
494adb7b-a7c5-4c04-b884-4df72d227ce7	-6	140	134	Play on server Ariuan's Server	2026-05-13 14:35:29.576	844193954756689921	1	\N	\N	\N
6f798831-0e4e-4aae-8863-db9543b18aad	-6	134	128	Play on server Ariuan's Server	2026-05-13 14:43:25.335	844193954756689921	1	\N	\N	\N
224d3f7a-5581-442b-879c-59472745d188	-6	128	122	Play on server Ariuan's Server	2026-05-13 14:51:45.326	844193954756689921	1	\N	\N	\N
e964f0f7-3a63-4175-9c89-4a444930d1b5	-6	122	116	Play on server Ariuan's Server	2026-05-13 15:00:05.324	844193954756689921	1	\N	\N	\N
b3959ba4-1d49-4c82-b865-c683ae0d69ca	-6	116	110	Play on server Ariuan's Server	2026-05-13 15:05:24.362	844193954756689921	1	\N	\N	\N
9a2cb99e-dbab-4fdc-8347-ba160e57d152	-6	110	104	Play on server Ariuan's Server	2026-05-13 15:13:44.425	844193954756689921	1	\N	\N	\N
619c62e4-184d-45c4-8684-80ff335567a7	-6	104	98	Play on server Ariuan's Server	2026-05-13 15:22:04.425	844193954756689921	1	\N	\N	\N
92f367ea-7637-423f-9fe4-6fdc8dee16a8	-6	98	92	Play on server Ariuan's Server	2026-05-13 15:30:24.417	844193954756689921	1	\N	\N	\N
2ce3be45-1480-4d2a-9a41-e31787bd6877	-6	92	86	Play on server Ariuan's Server	2026-05-13 15:38:44.403	844193954756689921	1	\N	\N	\N
97a28472-03ed-4905-be2f-84d38fcfaef8	-6	86	80	Play on server Ariuan's Server	2026-05-13 15:47:04.416	844193954756689921	1	\N	\N	\N
7c6e6943-996d-43bf-b2f8-43a8fb0d4906	-6	80	74	Play on server Ariuan's Server	2026-05-13 15:55:24.391	844193954756689921	1	\N	\N	\N
516fb9d7-d14e-466c-a133-8185d04d4248	-6	74	68	Play on server Ariuan's Server	2026-05-13 16:03:44.42	844193954756689921	1	\N	\N	\N
aacc17f9-ee38-4170-bdc0-b0692a3cd380	-6	68	62	Play on server Ariuan's Server	2026-05-13 16:12:04.422	844193954756689921	1	\N	\N	\N
a14ab642-7118-4e84-b5c5-dc2867685fc8	-6	62	56	Play on server Ariuan's Server	2026-05-13 16:20:24.377	844193954756689921	1	\N	\N	\N
019c9213-a468-4414-bb92-4adeeecd8ed5	-6	56	50	Play on server Ariuan's Server	2026-05-13 16:27:14.833	844193954756689921	1	\N	\N	\N
82ec3cf3-0e80-4554-9bfd-4d10b8da4023	-6	218	212	Play on server Ariuan's Server	2026-05-13 16:31:51.943	780972375394091009	1	\N	\N	\N
acf56676-1242-43ce-a788-f9dc3d6d12c8	-6	50	44	Play on server Ariuan's Server	2026-05-13 16:33:39.837	844193954756689921	1	\N	\N	\N
b8d42b1c-0cec-4cac-8e44-7a617d30dc4a	-6	44	38	Play on server Ariuan's Server	2026-05-13 16:39:49.233	844193954756689921	1	\N	\N	\N
18cbc56c-8a0a-4d1a-8517-d04f186abab4	-6	212	206	Play on server Ariuan's Server	2026-05-13 16:40:11.947	780972375394091009	1	\N	\N	\N
4f372bf8-9508-44c8-9449-fe1819ea6b81	-6	38	32	Play on server Ariuan's Server	2026-05-13 16:47:38.672	844193954756689921	1	\N	\N	\N
907307d4-0df3-416a-9b8c-ada529b69e94	-6	206	200	Play on server Ariuan's Server	2026-05-13 16:48:31.94	780972375394091009	1	\N	\N	\N
5839b94a-1e46-4674-b586-32c6f4eb5ff4	-6	32	26	Play on server Ariuan's Server	2026-05-13 16:52:57.134	844193954756689921	1	\N	\N	\N
4583da5d-5410-46ad-a43c-7c198a3ae9ae	-6	26	20	Play on server Ariuan's Server	2026-05-13 17:01:17.153	844193954756689921	1	\N	\N	\N
81e14b64-d687-46ef-bb27-274904e0235d	-6	20	14	Play on server Ariuan's Server	2026-05-13 17:09:37.159	844193954756689921	1	\N	\N	\N
53508c21-2cfc-4771-b3c4-c0358a4f0bbc	100	200	300	Daily Gift	2026-05-14 06:00:07.275	780972375394091009	\N	\N	\N	\N
d68e6b8c-74d9-45ca-994e-baccae029320	100	14	114	Daily Gift	2026-05-14 06:00:07.953	844193954756689921	\N	\N	\N	\N
3c47aabb-a4bf-4417-9f5f-bed8881013e2	100	114	214	Daily Gift	2026-05-15 06:00:07.709	844193954756689921	\N	\N	\N	\N
9c308b0f-1a92-43fb-9bd1-afefc52d3c1e	-30	300	270	New Start Server Poll	2026-05-15 09:21:32.186	780972375394091009	1	\N	\N	\N
d9521c6d-5498-4f2f-a7cb-29f29c587b81	-30	270	240	New Start Server Poll	2026-05-15 09:22:05.534	780972375394091009	1	\N	\N	\N
ced3beb5-650b-4ac6-92c1-e234bc933713	-15	240	225	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-15 09:26:26.069	780972375394091009	1	\N	\N	\N
e505f08f-4f0b-4cec-a219-2ac512006aba	-15	214	199	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-15 09:32:41.437	844193954756689921	1	\N	\N	\N
6985f7e3-4df8-4bc1-80cf-dd643bcd2ac2	-15	283	268	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-15 10:55:50.186	645919565758464010	1	\N	\N	\N
b531667a-66ee-4a78-9f46-bb6919c726e6	-6	199	193	Play on server Ariuan's Server	2026-05-15 12:58:21.482	844193954756689921	1	\N	\N	\N
e2a0fc04-330d-4757-8341-5171fb36c39d	-6	193	187	Play on server Ariuan's Server	2026-05-15 13:06:41.471	844193954756689921	1	\N	\N	\N
37657350-897f-4119-b368-f058832bd97e	-6	187	181	Play on server Ariuan's Server	2026-05-15 13:15:01.48	844193954756689921	1	\N	\N	\N
6b161073-c0f6-4cac-aade-0e384a5d5407	-6	181	175	Play on server Ariuan's Server	2026-05-15 13:23:21.553	844193954756689921	1	\N	\N	\N
1fd113e1-d187-4bc3-ade2-6dbb3ca30bf2	-6	175	169	Play on server Ariuan's Server	2026-05-15 13:31:41.553	844193954756689921	1	\N	\N	\N
0cab1da8-df8d-408b-ab0c-5d68a0bdf3a3	-6	169	163	Play on server Ariuan's Server	2026-05-15 13:40:01.571	844193954756689921	1	\N	\N	\N
a9ff4d94-1336-4490-a29e-16a2f79cd11e	-6	163	157	Play on server Ariuan's Server	2026-05-15 13:48:21.59	844193954756689921	1	\N	\N	\N
7fe43e29-0f90-411a-b4f3-3451c2e468e5	-6	157	151	Play on server Ariuan's Server	2026-05-15 13:56:41.592	844193954756689921	1	\N	\N	\N
99b2b7cd-abab-4588-a25b-2f5843c6b358	-6	151	145	Play on server Ariuan's Server	2026-05-15 14:03:10.841	844193954756689921	1	\N	\N	\N
266a0929-f0a9-499c-b474-a9d32161a67f	-6	145	139	Play on server Ariuan's Server	2026-05-15 14:11:30.825	844193954756689921	1	\N	\N	\N
068e2d0f-031c-4a0d-9df1-c0ddca939c3e	-6	139	133	Play on server Ariuan's Server	2026-05-15 14:19:50.823	844193954756689921	1	\N	\N	\N
63447694-7f9a-410f-9d00-566222d671ff	-6	133	127	Play on server Ariuan's Server	2026-05-15 14:28:10.832	844193954756689921	1	\N	\N	\N
a1f2dc5c-0bb2-4f00-b59e-b7a68971f556	-6	127	121	Play on server Ariuan's Server	2026-05-15 14:33:42.019	844193954756689921	1	\N	\N	\N
c6074a1b-6178-4603-9a66-e864125b8b07	-6	121	115	Play on server Ariuan's Server	2026-05-15 14:42:02.027	844193954756689921	1	\N	\N	\N
4881bb6d-53fa-43e8-be47-06229b07fa25	-6	115	109	Play on server Ariuan's Server	2026-05-15 14:50:22.031	844193954756689921	1	\N	\N	\N
4d6522fe-7f1d-42d0-9bf6-c6a7f076df2a	-6	225	219	Play on server Ariuan's Server	2026-05-15 14:57:18.882	780972375394091009	1	\N	\N	\N
aa8f3479-2c49-4aea-b7d4-5e32a7102b47	-6	109	103	Play on server Ariuan's Server	2026-05-15 14:58:42.04	844193954756689921	1	\N	\N	\N
fbccf91d-1a17-4778-b524-2a2dd7d77b6c	-6	219	213	Play on server Ariuan's Server	2026-05-15 15:05:38.896	780972375394091009	1	\N	\N	\N
b2c34b04-84ba-400b-90b0-e3a6acc2f004	-6	103	97	Play on server Ariuan's Server	2026-05-15 15:07:02.038	844193954756689921	1	\N	\N	\N
dcec0072-0eb8-489c-8d26-59372b0fce69	-6	97	91	Play on server Ariuan's Server	2026-05-15 15:13:07.202	844193954756689921	1	\N	\N	\N
5d92b8d8-4436-4e10-8eaa-7dfad85ac4eb	-6	213	207	Play on server Ariuan's Server	2026-05-15 15:13:58.891	780972375394091009	1	\N	\N	\N
e73eee35-99f9-4135-b749-e89d519bc655	-6	91	85	Play on server Ariuan's Server	2026-05-15 15:21:27.16	844193954756689921	1	\N	\N	\N
7b61d97a-83c1-4d68-a184-dfdb5d6845de	-6	207	201	Play on server Ariuan's Server	2026-05-15 15:22:18.858	780972375394091009	1	\N	\N	\N
70563475-4d90-48cb-b56e-84cb52c1848b	-6	85	79	Play on server Ariuan's Server	2026-05-15 15:27:48.472	844193954756689921	1	\N	\N	\N
20deef93-4e8a-45a7-9bfb-26fbd5bf4256	-6	201	195	Play on server Ariuan's Server	2026-05-15 15:30:38.854	780972375394091009	1	\N	\N	\N
59519c7a-7b57-43a3-8d4a-0f89cab65064	-6	79	73	Play on server Ariuan's Server	2026-05-15 15:36:08.469	844193954756689921	1	\N	\N	\N
8a7a055a-7ea3-461a-bb19-29dbc660dff9	-6	195	189	Play on server Ariuan's Server	2026-05-15 15:38:58.856	780972375394091009	1	\N	\N	\N
03c2ca21-1ddf-4cfd-972b-1bb97f605e32	-6	73	67	Play on server Ariuan's Server	2026-05-15 15:44:28.455	844193954756689921	1	\N	\N	\N
5fbfae4a-74e5-4982-a6f9-09add7850265	-6	189	183	Play on server Ariuan's Server	2026-05-15 15:47:18.865	780972375394091009	1	\N	\N	\N
b6f9277a-edbc-4113-9783-eac5a580316f	-6	67	61	Play on server Ariuan's Server	2026-05-15 15:50:03.886	844193954756689921	1	\N	\N	\N
1022f315-42ff-4b75-bed0-a2147f72182c	-6	183	177	Play on server Ariuan's Server	2026-05-15 15:55:38.868	780972375394091009	1	\N	\N	\N
6d28e724-e483-4ddf-be1f-9490c54f397a	-6	61	55	Play on server Ariuan's Server	2026-05-15 15:58:23.913	844193954756689921	1	\N	\N	\N
20504060-fb78-488c-a72f-0a4d67092726	-6	177	171	Play on server Ariuan's Server	2026-05-15 16:03:58.866	780972375394091009	1	\N	\N	\N
e217a1e1-f897-46d4-ab59-4cdc5c271d85	-6	55	49	Play on server Ariuan's Server	2026-05-15 16:06:43.899	844193954756689921	1	\N	\N	\N
ddf66001-fdb6-4605-b7fe-ed2e7392bfab	-6	171	165	Play on server Ariuan's Server	2026-05-15 16:12:18.868	780972375394091009	1	\N	\N	\N
d99eaf19-c30e-4472-a47d-ccbccf49c3ea	-6	49	43	Play on server Ariuan's Server	2026-05-15 16:15:03.891	844193954756689921	1	\N	\N	\N
47ffec78-dc8a-4f67-b769-d9f14ee01b18	-6	165	159	Play on server Ariuan's Server	2026-05-15 16:20:38.856	780972375394091009	1	\N	\N	\N
3607e454-ec75-418e-8f74-2933f8699093	-6	43	37	Play on server Ariuan's Server	2026-05-15 16:23:23.905	844193954756689921	1	\N	\N	\N
321e3246-8874-4d83-8a37-201045c32637	-6	159	153	Play on server Ariuan's Server	2026-05-15 16:28:58.848	780972375394091009	1	\N	\N	\N
294ae68a-daf1-412a-a19f-12c15eb27bc7	-6	37	31	Play on server Ariuan's Server	2026-05-15 16:31:43.886	844193954756689921	1	\N	\N	\N
416c42f6-4ab5-4c4d-bd43-6de6b702fae2	-6	153	147	Play on server Ariuan's Server	2026-05-15 16:37:18.847	780972375394091009	1	\N	\N	\N
e119139a-df43-4cab-9792-6b303b1397ea	-6	31	25	Play on server Ariuan's Server	2026-05-15 16:38:51.352	844193954756689921	1	\N	\N	\N
abee33b4-457b-444a-8354-b7baab29f3fc	-6	147	141	Play on server Ariuan's Server	2026-05-15 16:45:38.85	780972375394091009	1	\N	\N	\N
201c9184-5c55-4ded-beab-3b3c1be05b35	-6	25	19	Play on server Ariuan's Server	2026-05-15 16:47:11.351	844193954756689921	1	\N	\N	\N
35d30a3f-d987-429c-afbc-c9c3ddd6f934	-6	141	135	Play on server Ariuan's Server	2026-05-15 16:53:58.845	780972375394091009	1	\N	\N	\N
d36cc485-287b-4cf9-a008-80eb3a53882e	-6	19	13	Play on server Ariuan's Server	2026-05-15 16:55:31.35	844193954756689921	1	\N	\N	\N
42778899-f86e-4869-b722-ea75532d9ae4	-6	135	129	Play on server Ariuan's Server	2026-05-15 17:02:18.844	780972375394091009	1	\N	\N	\N
9ed7f1ec-e330-4375-a1ae-17e2d562ab5b	-6	13	7	Play on server Ariuan's Server	2026-05-15 17:03:51.334	844193954756689921	1	\N	\N	\N
6735d807-ae95-40b6-80c7-484c6a9863cb	-6	129	123	Play on server Ariuan's Server	2026-05-15 17:10:38.841	780972375394091009	1	\N	\N	\N
1a282cf2-17c8-48b0-9190-d09c7f3483e9	-6	7	1	Play on server Ariuan's Server	2026-05-15 17:12:11.343	844193954756689921	1	\N	\N	\N
b9385acd-0c7a-4af1-85de-884a9bf97568	-6	123	117	Play on server Ariuan's Server	2026-05-15 17:18:58.913	780972375394091009	1	\N	\N	\N
428c3b57-dd97-4c9f-bda2-d228ef5bc544	-6	117	111	Play on server Ariuan's Server	2026-05-15 17:27:18.913	780972375394091009	1	\N	\N	\N
67f874a5-bde2-42bd-97a3-0b48f7d1d919	-6	111	105	Play on server Ariuan's Server	2026-05-15 17:35:38.919	780972375394091009	1	\N	\N	\N
b0f8d8a8-df37-4bce-a595-66c1d4cb9655	-6	105	99	Play on server Ariuan's Server	2026-05-15 17:43:58.958	780972375394091009	1	\N	\N	\N
f5bed2b3-d335-40e1-88ff-0a71a5cdca55	100	1	101	Daily Gift	2026-05-16 06:00:08.294	844193954756689921	\N	\N	\N	\N
28ef6389-3dcc-484b-be73-c54421807689	100	99	199	Daily Gift	2026-05-16 06:00:08.887	780972375394091009	\N	\N	\N	\N
531865ae-f702-46e5-ba22-e33fc47129e4	100	101	201	Daily Gift	2026-05-17 06:00:08.77	844193954756689921	\N	\N	\N	\N
033f75d9-663e-4760-886e-768567144aed	100	199	299	Daily Gift	2026-05-17 06:00:09.343	780972375394091009	\N	\N	\N	\N
ce08c2c0-a323-45e4-a439-e6de194d1ff9	-30	299	269	New Start Server Poll	2026-05-17 08:21:23.437	780972375394091009	1	\N	\N	\N
6536e2c2-b655-4dff-bb1a-fcec82ee9524	-15	269	254	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-17 08:21:28.437	780972375394091009	1	\N	\N	\N
31c36a2b-f9aa-4b05-96d7-3e33abd98c35	-15	201	186	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-17 08:21:36.529	844193954756689921	1	\N	\N	\N
af1e0269-58dc-4317-8bdc-b016cbef7c8b	-15	268	253	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-17 08:29:28.265	645919565758464010	1	\N	\N	\N
afee4dff-e951-4084-ac01-543eb5878859	-6	254	248	Play on server Ariuan's Server	2026-05-17 09:26:32.237	780972375394091009	1	\N	\N	\N
91fe38fe-faa6-43a3-8879-fd83f01c0897	-6	248	242	Play on server Ariuan's Server	2026-05-17 09:34:52.243	780972375394091009	1	\N	\N	\N
7f496cba-cfbb-402b-8cf2-be6451574a68	-6	186	180	Play on server Ariuan's Server	2026-05-17 11:45:20.993	844193954756689921	1	\N	\N	\N
d22d4bdc-dc2b-44fc-849c-84c282980f21	-6	180	174	Play on server Ariuan's Server	2026-05-17 11:53:41.055	844193954756689921	1	\N	\N	\N
a550a8aa-f6fd-4824-bad4-70663885fdd6	-6	174	168	Play on server Ariuan's Server	2026-05-17 12:01:29.388	844193954756689921	1	\N	\N	\N
07aec42c-066a-479a-9258-319a88e37eaf	-6	168	162	Play on server Ariuan's Server	2026-05-17 12:09:49.354	844193954756689921	1	\N	\N	\N
1ac2092e-3ebe-42ae-9b33-e35d414a76f0	-6	162	156	Play on server Ariuan's Server	2026-05-17 12:18:09.356	844193954756689921	1	\N	\N	\N
d73a658e-2678-4a42-b277-02172690b940	-6	156	150	Play on server Ariuan's Server	2026-05-17 12:26:29.374	844193954756689921	1	\N	\N	\N
31e91c8a-d626-4936-b4e4-64b61f8a668a	-6	150	144	Play on server Ariuan's Server	2026-05-17 12:33:14.825	844193954756689921	1	\N	\N	\N
d79b92a6-4bef-46b7-a35c-5e87ef3e8a3c	-6	144	138	Play on server Ariuan's Server	2026-05-17 12:41:34.837	844193954756689921	1	\N	\N	\N
9ed64d3b-a513-4a9c-880e-70cc555442e2	-6	138	132	Play on server Ariuan's Server	2026-05-17 12:49:54.83	844193954756689921	1	\N	\N	\N
c69ea01f-be94-440d-ae1e-0a62be11b781	-6	132	126	Play on server Ariuan's Server	2026-05-17 12:58:14.852	844193954756689921	1	\N	\N	\N
6486f00a-71ef-4059-95ca-b99434ff6fe5	-6	126	120	Play on server Ariuan's Server	2026-05-17 13:04:51.989	844193954756689921	1	\N	\N	\N
292951f2-e77a-44f0-8238-8437a3c49cd9	-6	120	114	Play on server Ariuan's Server	2026-05-17 13:13:12.005	844193954756689921	1	\N	\N	\N
23318785-9e1b-47a1-bf2c-befd86890dc3	-6	114	108	Play on server Ariuan's Server	2026-05-17 13:21:32.002	844193954756689921	1	\N	\N	\N
d9a3e580-bc3e-4ab5-940b-3d610c81d6ac	-6	108	102	Play on server Ariuan's Server	2026-05-17 13:29:52.003	844193954756689921	1	\N	\N	\N
e7d862b2-3752-4c54-81cb-5dc6a4f101aa	-6	102	96	Play on server Ariuan's Server	2026-05-17 13:38:12.023	844193954756689921	1	\N	\N	\N
4b8518be-6b3a-4438-92bb-e375bf0de26e	-6	242	236	Play on server Ariuan's Server	2026-05-17 13:41:54.571	780972375394091009	1	\N	\N	\N
a8384538-559b-479a-9004-49a94fa4f0c8	-6	96	90	Play on server Ariuan's Server	2026-05-17 13:46:32.019	844193954756689921	1	\N	\N	\N
d153b8eb-f8ee-443d-bd94-b639dd64a12f	-6	236	230	Play on server Ariuan's Server	2026-05-17 13:50:14.586	780972375394091009	1	\N	\N	\N
a6d5f8de-6dcf-4716-b56a-508b1693152f	-6	90	84	Play on server Ariuan's Server	2026-05-17 13:53:22.468	844193954756689921	1	\N	\N	\N
906d2e9e-f160-4ca7-a6d3-6bc07d8a8050	-6	230	224	Play on server Ariuan's Server	2026-05-17 13:58:34.588	780972375394091009	1	\N	\N	\N
5e9fe230-e700-46b7-b079-8be5842b3755	-6	84	78	Play on server Ariuan's Server	2026-05-17 14:01:42.492	844193954756689921	1	\N	\N	\N
bd72966d-6d68-412f-9c29-0e811cf31fc0	-6	253	247	Play on server Ariuan's Server	2026-05-17 14:05:37.529	645919565758464010	1	\N	\N	\N
ccfb1f10-f51a-4d00-b9f8-425c36fb6edb	-6	224	218	Play on server Ariuan's Server	2026-05-17 14:06:54.571	780972375394091009	1	\N	\N	\N
861d56d8-e603-4f64-9ae6-fb8bdc0efc04	-6	78	72	Play on server Ariuan's Server	2026-05-17 14:10:02.475	844193954756689921	1	\N	\N	\N
a17b16b8-aa82-4109-85a7-d2c43a77b6b4	-6	247	241	Play on server Ariuan's Server	2026-05-17 14:13:57.536	645919565758464010	1	\N	\N	\N
092af8a9-8e07-4c80-adc5-44bbf0f56c69	-6	218	212	Play on server Ariuan's Server	2026-05-17 14:15:14.599	780972375394091009	1	\N	\N	\N
0c5b9d04-9506-4d0b-bdfe-f2f34bfeff16	-6	72	66	Play on server Ariuan's Server	2026-05-17 14:18:22.491	844193954756689921	1	\N	\N	\N
d36342a5-f085-4681-b660-7429dea91986	-6	241	235	Play on server Ariuan's Server	2026-05-17 14:22:17.486	645919565758464010	1	\N	\N	\N
813e10b6-b3ce-48ee-9c45-2a59eadfb680	-6	212	206	Play on server Ariuan's Server	2026-05-17 14:23:34.55	780972375394091009	1	\N	\N	\N
8af3b6f8-f0f7-479f-bdce-aca4b8f2844d	-6	66	60	Play on server Ariuan's Server	2026-05-17 14:26:42.45	844193954756689921	1	\N	\N	\N
d4c73e6f-4da7-46a2-a55b-2c3d98444d99	-6	235	229	Play on server Ariuan's Server	2026-05-17 14:29:04.62	645919565758464010	1	\N	\N	\N
26dcc320-f48d-4820-9e56-895cb712cd77	-6	206	200	Play on server Ariuan's Server	2026-05-17 14:31:54.546	780972375394091009	1	\N	\N	\N
3fd64afb-2824-48c7-ac5a-0e667ac91210	-6	60	54	Play on server Ariuan's Server	2026-05-17 14:35:02.435	844193954756689921	1	\N	\N	\N
ad798305-4f18-4f9b-8a63-3e67f87fa839	-6	202	196	Play on server Ariuan's Server	2026-05-17 14:36:32.237	658305794038825030	1	\N	\N	\N
0c8e53d4-2c81-4f90-8867-aea63e48bd03	-6	229	223	Play on server Ariuan's Server	2026-05-17 14:37:24.641	645919565758464010	1	\N	\N	\N
8c72f9d6-66fb-44cb-8bf5-8e9b907b28e5	-6	200	194	Play on server Ariuan's Server	2026-05-17 14:40:14.555	780972375394091009	1	\N	\N	\N
75e91e40-85b0-4207-915d-40682ee5adc1	-6	54	48	Play on server Ariuan's Server	2026-05-17 14:43:22.451	844193954756689921	1	\N	\N	\N
dfaad096-69d5-4323-8de9-972b211ae164	-6	223	217	Play on server Ariuan's Server	2026-05-17 14:45:44.665	645919565758464010	1	\N	\N	\N
7a04a6c3-3fb2-40cb-a9ff-33b615d6bb0f	-6	194	188	Play on server Ariuan's Server	2026-05-17 14:48:34.584	780972375394091009	1	\N	\N	\N
ed312bc7-c4db-4573-affe-f3e9ff590702	-6	48	42	Play on server Ariuan's Server	2026-05-17 14:51:42.459	844193954756689921	1	\N	\N	\N
88f502a7-5231-48e2-9757-74fb13ccccda	-6	217	211	Play on server Ariuan's Server	2026-05-17 14:53:44.328	645919565758464010	1	\N	\N	\N
2da3a7db-6f44-4b8b-9fc7-9eae35b3f4c5	-6	188	182	Play on server Ariuan's Server	2026-05-17 14:56:54.577	780972375394091009	1	\N	\N	\N
ce0d4081-0c3d-4b3f-985c-981fa8cab215	-6	42	36	Play on server Ariuan's Server	2026-05-17 15:00:02.468	844193954756689921	1	\N	\N	\N
f2ea63c6-2f87-462a-92f5-d3f10a4b0f07	-6	182	176	Play on server Ariuan's Server	2026-05-17 15:05:14.584	780972375394091009	1	\N	\N	\N
5d1d91cd-c276-4aaa-875d-3e8dcd9aff7b	-6	36	30	Play on server Ariuan's Server	2026-05-17 15:08:22.491	844193954756689921	1	\N	\N	\N
c08e78af-534a-44da-b81a-4dd24ca6a5e1	-6	176	170	Play on server Ariuan's Server	2026-05-17 15:13:34.585	780972375394091009	1	\N	\N	\N
5789119f-da43-41a7-9b4a-8400723d978d	-6	30	24	Play on server Ariuan's Server	2026-05-17 15:15:13.393	844193954756689921	1	\N	\N	\N
236ef64e-19b7-42e2-88e2-f14e953a0857	-6	170	164	Play on server Ariuan's Server	2026-05-17 15:21:54.599	780972375394091009	1	\N	\N	\N
cc09531c-df0c-4e92-ab14-704d4616537f	-6	24	18	Play on server Ariuan's Server	2026-05-17 15:23:33.392	844193954756689921	1	\N	\N	\N
34ce3d39-0e76-472a-855b-8d8ff9fcbc9d	-6	164	158	Play on server Ariuan's Server	2026-05-17 15:30:14.618	780972375394091009	1	\N	\N	\N
c2d29e74-bc26-44ec-bfe2-8838de27ca6a	-6	18	12	Play on server Ariuan's Server	2026-05-17 15:31:53.41	844193954756689921	1	\N	\N	\N
624b9fb7-26a3-4a64-a850-4d4287c863c0	-6	158	152	Play on server Ariuan's Server	2026-05-17 15:38:34.583	780972375394091009	1	\N	\N	\N
4ec35527-362f-450f-8340-7fd94003b05e	-6	12	6	Play on server Ariuan's Server	2026-05-17 15:40:13.387	844193954756689921	1	\N	\N	\N
744ccf9e-0595-4f97-92e8-7755498d08dd	-6	152	146	Play on server Ariuan's Server	2026-05-17 15:46:54.578	780972375394091009	1	\N	\N	\N
14faf511-d43d-4e35-8533-8d98fe1126ad	-6	6	0	Play on server Ariuan's Server	2026-05-17 15:48:33.369	844193954756689921	1	\N	\N	\N
55d80551-c403-4be0-ad40-2b3bf72e74d1	-6	146	140	Play on server Ariuan's Server	2026-05-17 15:55:14.579	780972375394091009	1	\N	\N	\N
79c83a1f-933f-4918-bdfb-0cf1fa1b46de	-6	140	134	Play on server Ariuan's Server	2026-05-17 16:03:34.583	780972375394091009	1	\N	\N	\N
5e06c1ab-8222-4bbe-8f1b-1db6da5f2f62	-6	211	205	Play on server Ariuan's Server	2026-05-17 16:04:32.302	645919565758464010	1	\N	\N	\N
17a52ac6-8b67-41fe-9efd-5a80d3dffca2	-6	134	128	Play on server Ariuan's Server	2026-05-17 16:11:54.572	780972375394091009	1	\N	\N	\N
4f50c2c1-e901-4e3a-8f69-eac209bacc18	-6	205	199	Play on server Ariuan's Server	2026-05-17 16:12:52.318	645919565758464010	1	\N	\N	\N
c1fa5393-4174-4091-a347-80ff9fc0507b	-6	128	122	Play on server Ariuan's Server	2026-05-17 16:20:14.575	780972375394091009	1	\N	\N	\N
0824a5fe-22c9-4d49-8e11-7fb82bda4c86	-6	199	193	Play on server Ariuan's Server	2026-05-17 16:21:12.309	645919565758464010	1	\N	\N	\N
3ef3d731-be12-49c2-a5b8-eaaf6d95b51a	-6	122	116	Play on server Ariuan's Server	2026-05-17 16:28:34.58	780972375394091009	1	\N	\N	\N
e8b0b4e6-b254-433b-b95a-83b52c0d795d	-6	193	187	Play on server Ariuan's Server	2026-05-17 16:29:32.307	645919565758464010	1	\N	\N	\N
8d1dd700-986d-43fb-91d4-a8b9a5b90579	-6	116	110	Play on server Ariuan's Server	2026-05-17 16:36:54.623	780972375394091009	1	\N	\N	\N
3a63c7ae-c10b-41a5-87bd-7e3078cda5c8	-6	187	181	Play on server Ariuan's Server	2026-05-17 16:37:52.368	645919565758464010	1	\N	\N	\N
8ffc2796-2f8c-47f7-aa39-a4714a81c2ba	-6	110	104	Play on server Ariuan's Server	2026-05-17 16:45:14.634	780972375394091009	1	\N	\N	\N
ec4eb45c-6259-449c-9909-77728872ff5f	100	181	281	Daily Gift	2026-05-18 06:00:10.681	645919565758464010	\N	\N	\N	\N
f1de36dc-9e30-459d-adc8-59a81493749f	100	104	204	Daily Gift	2026-05-18 06:00:11.448	780972375394091009	\N	\N	\N	\N
b6f5b0c9-7ea9-46d5-81fc-e9079f59f500	-30	281	251	New Start Server Poll	2026-05-18 12:59:58.772	645919565758464010	1	\N	\N	\N
a4fb523d-0b68-46ac-823d-0350782b9941	-15	251	236	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-18 13:00:10.622	645919565758464010	1	\N	\N	\N
2b993fe1-b41a-4f7b-8c7a-744c81e95061	-15	100	85	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-18 13:00:42.483	844193954756689921	1	\N	\N	\N
0a474067-2392-4a6a-91c5-8bfdaea34bd6	-15	204	189	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-18 13:01:20.05	780972375394091009	1	\N	\N	\N
18c5376f-1797-44b5-84c6-3d9b82f3d33d	-6	236	230	Play on server Ariuan's Server	2026-05-18 13:01:42.296	645919565758464010	1	\N	\N	\N
2cb7ce14-7e8d-45fb-9d5c-8a6d50d24503	-6	230	224	Play on server Ariuan's Server	2026-05-18 13:10:02.3	645919565758464010	1	\N	\N	\N
e5df20eb-1c34-4058-b0c3-e1c70fbd2e23	-6	224	218	Play on server Ariuan's Server	2026-05-18 13:18:22.316	645919565758464010	1	\N	\N	\N
0c8e9fba-0381-4f0f-bf31-d71092d3865b	-6	218	212	Play on server Ariuan's Server	2026-05-18 13:26:42.324	645919565758464010	1	\N	\N	\N
3785a714-31f6-47d5-b559-d1d1e22428b7	-6	212	206	Play on server Ariuan's Server	2026-05-18 13:35:02.327	645919565758464010	1	\N	\N	\N
12ad35f5-67a6-4e16-bcdc-a75dc7093ad1	-6	206	200	Play on server Ariuan's Server	2026-05-18 13:43:22.341	645919565758464010	1	\N	\N	\N
8dd710a2-f159-4e2d-a601-224f9361eb35	-6	200	194	Play on server Ariuan's Server	2026-05-18 13:51:42.336	645919565758464010	1	\N	\N	\N
7d9e4c2d-0310-4ac3-8dfc-5cefe366727f	-6	194	188	Play on server Ariuan's Server	2026-05-18 14:00:02.331	645919565758464010	1	\N	\N	\N
836d07b1-bdd1-4636-9e8a-34f04ba92b73	-6	188	182	Play on server Ariuan's Server	2026-05-18 14:08:22.349	645919565758464010	1	\N	\N	\N
f0c9d39a-9d0b-449b-8540-bf17cd9531d3	-6	182	176	Play on server Ariuan's Server	2026-05-18 14:16:42.356	645919565758464010	1	\N	\N	\N
7232a564-6305-4857-9999-f894392ee1b4	-6	176	170	Play on server Ariuan's Server	2026-05-18 14:25:02.344	645919565758464010	1	\N	\N	\N
0a9a4249-39ea-41de-bf4d-28c0244b5bfa	-6	189	183	Play on server Ariuan's Server	2026-05-18 14:32:53.311	780972375394091009	1	\N	\N	\N
8499b8c3-d778-487b-9be2-633884efc012	-6	170	164	Play on server Ariuan's Server	2026-05-18 14:33:22.356	645919565758464010	1	\N	\N	\N
615c2888-18c6-4f1f-b0fd-b0feb044659f	-6	183	177	Play on server Ariuan's Server	2026-05-18 14:41:13.336	780972375394091009	1	\N	\N	\N
39ab7656-80d4-4d62-9fe8-2f245a9584b0	-6	164	158	Play on server Ariuan's Server	2026-05-18 14:41:42.365	645919565758464010	1	\N	\N	\N
6fe63b53-f3d7-4e45-ab85-8b393ffb9049	-6	177	171	Play on server Ariuan's Server	2026-05-18 14:49:33.213	780972375394091009	1	\N	\N	\N
6a76c2c9-4c8b-43fc-802e-aab5952e0d6b	-6	158	152	Play on server Ariuan's Server	2026-05-18 14:50:02.255	645919565758464010	1	\N	\N	\N
805fe57a-a20a-4332-a4bd-470d4de38b15	-6	171	165	Play on server Ariuan's Server	2026-05-18 14:57:53.254	780972375394091009	1	\N	\N	\N
e3a8a02b-db74-4ed2-acca-7d8a8040fbdb	-6	152	146	Play on server Ariuan's Server	2026-05-18 14:58:22.268	645919565758464010	1	\N	\N	\N
5608df29-476e-4697-a2c7-9b6ec387b11e	-6	165	159	Play on server Ariuan's Server	2026-05-18 15:06:13.234	780972375394091009	1	\N	\N	\N
fd14442e-5b23-4a78-9435-732dfe07161b	-6	146	140	Play on server Ariuan's Server	2026-05-18 15:06:42.277	645919565758464010	1	\N	\N	\N
63c7b961-f769-49d0-916f-8c244aeb6e90	-6	159	153	Play on server Ariuan's Server	2026-05-18 15:14:33.214	780972375394091009	1	\N	\N	\N
e164d05d-aa68-46dc-97f4-276921566b6f	-6	140	134	Play on server Ariuan's Server	2026-05-18 15:15:02.25	645919565758464010	1	\N	\N	\N
77eca3f8-d109-4ec9-a01c-78d55c591e7f	-6	153	147	Play on server Ariuan's Server	2026-05-18 15:22:53.229	780972375394091009	1	\N	\N	\N
4f1cd3c3-9e83-40a3-8225-f44d88803706	-6	134	128	Play on server Ariuan's Server	2026-05-18 15:24:15.809	645919565758464010	1	\N	\N	\N
3104cf03-5b10-4aac-a0ab-158b8f598ff1	-6	147	141	Play on server Ariuan's Server	2026-05-18 15:31:13.224	780972375394091009	1	\N	\N	\N
c94b7da1-d7b4-4bef-b7fc-3b5112d449d8	-6	128	122	Play on server Ariuan's Server	2026-05-18 15:32:35.815	645919565758464010	1	\N	\N	\N
9d6e60e2-0ae8-45eb-84f9-6a19e65885e0	-6	141	135	Play on server Ariuan's Server	2026-05-18 15:39:33.268	780972375394091009	1	\N	\N	\N
afcb4f83-4698-4fc3-8b42-b251b54b692b	-6	122	116	Play on server Ariuan's Server	2026-05-18 15:40:55.879	645919565758464010	1	\N	\N	\N
aa82e4b5-34b6-4d31-83d2-6cf8522d11c8	-6	135	129	Play on server Ariuan's Server	2026-05-18 15:47:53.276	780972375394091009	1	\N	\N	\N
04d3a3b3-d7dd-4d05-b6b5-13fa933b95c7	-6	116	110	Play on server Ariuan's Server	2026-05-18 15:49:15.879	645919565758464010	1	\N	\N	\N
857dda52-2922-4dfa-bce3-08fc1a59868f	-6	129	123	Play on server Ariuan's Server	2026-05-18 15:56:13.292	780972375394091009	1	\N	\N	\N
ef4b04df-6516-45cb-9a46-83309bb13285	-6	110	104	Play on server Ariuan's Server	2026-05-18 15:57:35.892	645919565758464010	1	\N	\N	\N
380dfb80-3dfe-46fe-86ed-0b2f3187a65e	-6	123	117	Play on server Ariuan's Server	2026-05-18 16:04:33.292	780972375394091009	1	\N	\N	\N
11b77c19-d768-47af-a05b-2345893b32ef	-6	104	98	Play on server Ariuan's Server	2026-05-18 16:05:55.897	645919565758464010	1	\N	\N	\N
37f4262d-4a1c-4e34-9376-c0b5d2667766	-6	117	111	Play on server Ariuan's Server	2026-05-18 16:12:53.298	780972375394091009	1	\N	\N	\N
1646af81-17d0-49cc-a3e7-8d55de649b43	-6	98	92	Play on server Ariuan's Server	2026-05-18 16:14:15.902	645919565758464010	1	\N	\N	\N
bc284e7a-a9d9-4c93-9637-1199ec3ac547	-6	111	105	Play on server Ariuan's Server	2026-05-18 16:21:13.297	780972375394091009	1	\N	\N	\N
a2bb2c20-f9c4-40cd-9b08-85c5d05f0bd4	-6	92	86	Play on server Ariuan's Server	2026-05-18 16:22:35.91	645919565758464010	1	\N	\N	\N
8ac8ec07-47bf-4ee8-8611-497a0dcb8522	-6	105	99	Play on server Ariuan's Server	2026-05-18 16:29:33.311	780972375394091009	1	\N	\N	\N
c43f84aa-1331-4576-9f22-fbcb10e6fabe	-6	86	80	Play on server Ariuan's Server	2026-05-18 16:30:55.905	645919565758464010	1	\N	\N	\N
18b7bbcc-1cd7-4739-8636-c0c69368c589	-6	99	93	Play on server Ariuan's Server	2026-05-18 16:37:53.31	780972375394091009	1	\N	\N	\N
3ec5c9c7-f91d-4c39-8fef-a4a48afdf3e8	-6	80	74	Play on server Ariuan's Server	2026-05-18 16:39:15.908	645919565758464010	1	\N	\N	\N
f317bb90-21ef-4cf6-978b-e43bafe2ee44	-6	93	87	Play on server Ariuan's Server	2026-05-18 16:46:13.325	780972375394091009	1	\N	\N	\N
c31efa1c-9ec4-4126-9518-808bed6733db	-6	74	68	Play on server Ariuan's Server	2026-05-18 16:47:35.927	645919565758464010	1	\N	\N	\N
46197474-b5bb-437d-b385-21a164cf38dd	-6	87	81	Play on server Ariuan's Server	2026-05-18 16:54:33.326	780972375394091009	1	\N	\N	\N
120159b1-fcb3-4618-a828-233805c52109	-6	68	62	Play on server Ariuan's Server	2026-05-18 16:56:30.861	645919565758464010	1	\N	\N	\N
6075ab76-c531-4b1a-8a9e-4822e21b83ab	-6	81	75	Play on server Ariuan's Server	2026-05-18 17:02:53.309	780972375394091009	1	\N	\N	\N
64808d4e-cb46-497f-bae1-2cd6bc9001e0	-6	62	56	Play on server Ariuan's Server	2026-05-18 17:04:50.868	645919565758464010	1	\N	\N	\N
a0959277-4448-42fd-a1d6-2d71d7789f93	-6	56	50	Play on server Ariuan's Server	2026-05-18 17:13:10.875	645919565758464010	1	\N	\N	\N
dfd84ce3-858a-4cb3-88b6-9d86880662c9	-6	50	44	Play on server Ariuan's Server	2026-05-18 17:21:30.894	645919565758464010	1	\N	\N	\N
28bf0fd3-7249-4b6c-8578-e9fc709ded7d	-6	44	38	Play on server Ariuan's Server	2026-05-18 17:29:50.883	645919565758464010	1	\N	\N	\N
bac90f9a-5584-4433-9f70-98026f0f4232	-6	38	32	Play on server Ariuan's Server	2026-05-18 17:38:10.9	645919565758464010	1	\N	\N	\N
977dd140-a2cc-4013-b78a-cca0aca361ff	-6	32	26	Play on server Ariuan's Server	2026-05-18 17:46:30.905	645919565758464010	1	\N	\N	\N
87488725-c96a-4eee-b0b6-0384cad7d0d8	-6	26	20	Play on server Ariuan's Server	2026-05-18 17:54:50.879	645919565758464010	1	\N	\N	\N
42d0b1c3-f1e0-4e4e-9498-bd2fa8e354b9	-6	20	14	Play on server Ariuan's Server	2026-05-18 18:03:10.899	645919565758464010	1	\N	\N	\N
844f2add-51d1-4746-ad7e-5fdc64193303	-6	14	8	Play on server Ariuan's Server	2026-05-18 18:11:30.906	645919565758464010	1	\N	\N	\N
b932192e-c3a1-4ace-8ebf-d60544af6130	-6	8	2	Play on server Ariuan's Server	2026-05-18 18:19:50.895	645919565758464010	1	\N	\N	\N
00268b83-fca4-45bc-9d1e-fd1a89e9b30a	100	75	175	Daily Gift	2026-05-19 06:00:09.771	780972375394091009	\N	\N	\N	\N
ae33e725-501c-46ce-9b51-f4c0b0db097c	100	85	185	Daily Gift	2026-05-19 06:00:10.451	844193954756689921	\N	\N	\N	\N
f2a8201c-e195-43af-bdfb-ee8c87a455bd	100	2	102	Daily Gift	2026-05-19 06:00:10.907	645919565758464010	\N	\N	\N	\N
be0e996b-1aa0-47d3-a392-87ec18d6bb38	100	175	275	Daily Gift	2026-05-20 06:00:10.286	780972375394091009	\N	\N	\N	\N
6b6ac9e8-0c65-4e64-bce9-185c850fddb3	100	185	285	Daily Gift	2026-05-20 06:00:11.143	844193954756689921	\N	\N	\N	\N
1c6669b1-02ea-431c-b81f-217a0e78c7f0	100	102	202	Daily Gift	2026-05-20 06:00:11.604	645919565758464010	\N	\N	\N	\N
58e77f51-7af2-43b5-aac4-90ebc73da484	-30	275	245	New Start Server Poll	2026-05-20 06:58:53.608	780972375394091009	1	\N	\N	\N
b57848f3-43d4-44b8-ad7f-69df1113ff64	-30	245	215	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-20 06:58:57.669	780972375394091009	1	\N	\N	\N
8d8e1a6d-71e2-4365-aa93-74ec71906990	-30	202	172	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-20 06:59:45.602	645919565758464010	1	\N	\N	\N
5a254cb8-24f3-47f3-933b-6db99c06cc6f	-30	285	255	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-20 07:23:29.734	844193954756689921	1	\N	\N	\N
ed8b208a-2fe2-4d33-990e-e3e98d7d0230	-6	215	209	Play on server Ariuan's Server	2026-05-20 11:33:36.141	780972375394091009	1	\N	\N	\N
d7e8d5f2-b701-46f1-9f94-ede181f0ee40	-6	209	203	Play on server Ariuan's Server	2026-05-20 11:41:56.116	780972375394091009	1	\N	\N	\N
d6f32f5e-5c54-43ae-8141-1213b2c7103f	-6	255	249	Play on server Ariuan's Server	2026-05-20 11:49:59.756	844193954756689921	1	\N	\N	\N
62ab63e7-4c97-4ca9-9ddf-68d68a175abb	-6	203	197	Play on server Ariuan's Server	2026-05-20 11:50:16.128	780972375394091009	1	\N	\N	\N
69380bee-5b64-4df4-a319-cabc58da869c	-6	249	243	Play on server Ariuan's Server	2026-05-20 11:58:19.771	844193954756689921	1	\N	\N	\N
ddcfda46-5ce9-46ed-ad4d-2941dd47dc30	-6	197	191	Play on server Ariuan's Server	2026-05-20 11:58:36.136	780972375394091009	1	\N	\N	\N
9d57a95f-a424-459c-a3fd-5f4114880356	-6	243	237	Play on server Ariuan's Server	2026-05-20 12:05:45.483	844193954756689921	1	\N	\N	\N
9032b893-73b6-4d13-9c53-1c220d0222fe	-6	191	185	Play on server Ariuan's Server	2026-05-20 12:06:56.127	780972375394091009	1	\N	\N	\N
e751f1c7-a50c-4ffb-9701-2fc8254e6dfa	-6	237	231	Play on server Ariuan's Server	2026-05-20 12:14:05.493	844193954756689921	1	\N	\N	\N
00ac2547-c0cf-403a-9b93-bc294a7b93b2	-6	185	179	Play on server Ariuan's Server	2026-05-20 12:15:16.157	780972375394091009	1	\N	\N	\N
4a6ac5a0-972d-4ce3-8642-ef625339b7a3	-6	231	225	Play on server Ariuan's Server	2026-05-20 12:22:25.493	844193954756689921	1	\N	\N	\N
799ebab3-f18b-47fd-872d-990bcff14cfb	-6	179	173	Play on server Ariuan's Server	2026-05-20 12:23:36.154	780972375394091009	1	\N	\N	\N
f55838f7-328c-47fc-9f69-2037148550a0	-6	225	219	Play on server Ariuan's Server	2026-05-20 12:30:45.505	844193954756689921	1	\N	\N	\N
e4508e06-7644-407f-9c09-098b50cfacb5	-6	173	167	Play on server Ariuan's Server	2026-05-20 12:31:56.146	780972375394091009	1	\N	\N	\N
906832e6-ad45-485f-b9e2-0d7ecc860094	-6	219	213	Play on server Ariuan's Server	2026-05-20 12:39:05.508	844193954756689921	1	\N	\N	\N
d30a8b6a-37a2-4abd-a712-08a6283a5c55	-6	167	161	Play on server Ariuan's Server	2026-05-20 12:40:16.17	780972375394091009	1	\N	\N	\N
c0a31e2a-8ba4-4080-b3e4-7fa96362c40d	-6	213	207	Play on server Ariuan's Server	2026-05-20 12:47:25.501	844193954756689921	1	\N	\N	\N
2c4b80e8-bd08-487b-bae0-2ab0dc5e1536	-6	161	155	Play on server Ariuan's Server	2026-05-20 12:48:36.167	780972375394091009	1	\N	\N	\N
bbbbf93d-810c-4cce-bbc3-a51ca0f535e9	-6	207	201	Play on server Ariuan's Server	2026-05-20 12:55:45.519	844193954756689921	1	\N	\N	\N
7cc59ba9-a8e0-4c47-88e6-8b95a4e7e918	-6	155	149	Play on server Ariuan's Server	2026-05-20 12:56:56.15	780972375394091009	1	\N	\N	\N
c69d0daf-5586-4a90-96e7-5f8983493ff4	-6	201	195	Play on server Ariuan's Server	2026-05-20 13:04:05.478	844193954756689921	1	\N	\N	\N
4fd77548-6faa-4736-80ec-d13362a466df	-6	149	143	Play on server Ariuan's Server	2026-05-20 13:05:16.14	780972375394091009	1	\N	\N	\N
f4c4bf83-11cd-4d0b-bfbc-ac20db97444e	-6	195	189	Play on server Ariuan's Server	2026-05-20 13:12:25.464	844193954756689921	1	\N	\N	\N
f5f8026e-b341-4887-923b-2bb22f5ffe46	-6	143	137	Play on server Ariuan's Server	2026-05-20 13:13:36.129	780972375394091009	1	\N	\N	\N
bbee78f2-684a-47fa-a890-e8667a1b397e	-6	189	183	Play on server Ariuan's Server	2026-05-20 13:20:45.478	844193954756689921	1	\N	\N	\N
b0b71503-a3d0-46ae-b892-d01474091abf	-6	137	131	Play on server Ariuan's Server	2026-05-20 13:21:56.122	780972375394091009	1	\N	\N	\N
97ddfa76-4724-43e0-91e3-42a48fee4c5a	-6	183	177	Play on server Ariuan's Server	2026-05-20 13:29:05.483	844193954756689921	1	\N	\N	\N
16277575-ee74-44e0-b353-094e83b6a933	-6	131	125	Play on server Ariuan's Server	2026-05-20 13:30:16.132	780972375394091009	1	\N	\N	\N
4599c55d-835b-4300-b719-4a9a1933aca7	-6	177	171	Play on server Ariuan's Server	2026-05-20 13:37:25.469	844193954756689921	1	\N	\N	\N
02ce2375-4b83-4a04-b335-3749085714bd	-6	125	119	Play on server Ariuan's Server	2026-05-20 13:38:36.133	780972375394091009	1	\N	\N	\N
8db3e7a4-1f12-4f23-8b0d-6aaea8b0919a	-6	171	165	Play on server Ariuan's Server	2026-05-20 13:44:43.075	844193954756689921	1	\N	\N	\N
8a29ef60-1bd6-459b-a277-de21b88cdcb2	-6	119	113	Play on server Ariuan's Server	2026-05-20 13:46:56.122	780972375394091009	1	\N	\N	\N
df1973a9-3415-467d-ba49-390bb68f355c	-6	165	159	Play on server Ariuan's Server	2026-05-20 13:51:44.229	844193954756689921	1	\N	\N	\N
125bfa07-490f-4a44-818d-036b15a25201	-6	113	107	Play on server Ariuan's Server	2026-05-20 13:55:16.394	780972375394091009	1	\N	\N	\N
ddad139a-f38b-42c3-91d7-69068d028466	-6	159	153	Play on server Ariuan's Server	2026-05-20 14:00:04.48	844193954756689921	1	\N	\N	\N
fbc6f51b-1552-4ca1-95e4-1d17e75e7582	-6	107	101	Play on server Ariuan's Server	2026-05-20 14:03:36.398	780972375394091009	1	\N	\N	\N
2006d177-7cc9-45c7-9a0c-4dcfb9d34f2c	-6	153	147	Play on server Ariuan's Server	2026-05-20 14:08:24.489	844193954756689921	1	\N	\N	\N
d51f8512-f8f3-48ea-889a-9a5c52f43c23	-6	101	95	Play on server Ariuan's Server	2026-05-20 14:11:56.38	780972375394091009	1	\N	\N	\N
817f5e20-f8c1-436d-a567-c599fcf13eaa	-6	147	141	Play on server Ariuan's Server	2026-05-20 14:16:44.459	844193954756689921	1	\N	\N	\N
a387b045-a1d2-483e-8098-91c8993636ed	-6	95	89	Play on server Ariuan's Server	2026-05-20 14:20:16.361	780972375394091009	1	\N	\N	\N
7bd320a1-1d72-4862-8380-9581a48ef1f3	-6	141	135	Play on server Ariuan's Server	2026-05-20 14:25:04.441	844193954756689921	1	\N	\N	\N
be26c21b-9cfb-4439-b736-3b565d862298	-6	89	83	Play on server Ariuan's Server	2026-05-20 14:28:36.374	780972375394091009	1	\N	\N	\N
8749ccf8-d07f-4741-a70a-b72ed2fea2f2	-6	135	129	Play on server Ariuan's Server	2026-05-20 14:33:11.646	844193954756689921	1	\N	\N	\N
24d63067-49a4-4e8b-add2-f165f23e26aa	-6	83	77	Play on server Ariuan's Server	2026-05-20 14:36:56.392	780972375394091009	1	\N	\N	\N
96ed44fd-60fc-468a-ada0-dfa34ad214dd	-6	129	123	Play on server Ariuan's Server	2026-05-20 14:41:31.684	844193954756689921	1	\N	\N	\N
df0f70de-9cdf-48d1-bc22-8460d76e3142	-6	77	71	Play on server Ariuan's Server	2026-05-20 14:45:16.419	780972375394091009	1	\N	\N	\N
abcae2bc-2547-46e8-a550-4490b95b80f9	-6	123	117	Play on server Ariuan's Server	2026-05-20 14:49:51.693	844193954756689921	1	\N	\N	\N
4b23bfab-4c86-47d5-bc42-64998ef85f3c	-6	71	65	Play on server Ariuan's Server	2026-05-20 14:53:36.412	780972375394091009	1	\N	\N	\N
123b6a2b-d564-4eb9-82b5-ce524a6dc0c0	-6	117	111	Play on server Ariuan's Server	2026-05-20 14:56:50.179	844193954756689921	1	\N	\N	\N
3ae02674-804a-4036-af70-5d04e44d7c3f	-6	65	59	Play on server Ariuan's Server	2026-05-20 15:01:56.412	780972375394091009	1	\N	\N	\N
01f630b2-8f61-40f4-8cea-822b4042e8f4	-6	111	105	Play on server Ariuan's Server	2026-05-20 15:05:10.215	844193954756689921	1	\N	\N	\N
df3654dd-aa06-48b4-8249-752ea1bcad86	-6	59	53	Play on server Ariuan's Server	2026-05-20 15:10:16.429	780972375394091009	1	\N	\N	\N
6e5fec14-57ee-422a-a66d-67f3991e1a97	-6	105	99	Play on server Ariuan's Server	2026-05-20 15:13:30.227	844193954756689921	1	\N	\N	\N
1b4551c3-b6f2-42c4-817f-4bf2b7f1f106	-6	53	47	Play on server Ariuan's Server	2026-05-20 15:18:36.437	780972375394091009	1	\N	\N	\N
d8d373f8-398b-4d81-bacf-24036859cb39	-6	99	93	Play on server Ariuan's Server	2026-05-20 15:21:50.231	844193954756689921	1	\N	\N	\N
52e94713-1511-4cb9-829c-88f37b80f8b0	-6	47	41	Play on server Ariuan's Server	2026-05-20 15:26:56.422	780972375394091009	1	\N	\N	\N
ae9f90a8-fdcd-4a57-b6ce-567c4e386de2	-6	93	87	Play on server Ariuan's Server	2026-05-20 15:30:10.223	844193954756689921	1	\N	\N	\N
9046581d-08cb-47ac-a025-fe75f05be2af	-6	41	35	Play on server Ariuan's Server	2026-05-20 15:35:16.45	780972375394091009	1	\N	\N	\N
b0c5a7e8-0c24-4f10-89c1-051a0754591c	-6	87	81	Play on server Ariuan's Server	2026-05-20 15:36:28.083	844193954756689921	1	\N	\N	\N
412533fa-ea3f-4fff-b5dc-dce6d96a09bb	-6	81	75	Play on server Ariuan's Server	2026-05-20 15:42:23.062	844193954756689921	1	\N	\N	\N
87a9d43a-eccb-4f87-97fc-8dde69fa3512	-6	35	29	Play on server Ariuan's Server	2026-05-20 15:43:36.433	780972375394091009	1	\N	\N	\N
9942f083-c15f-4c2c-b67c-824543bff07a	-6	75	69	Play on server Ariuan's Server	2026-05-20 15:50:43.08	844193954756689921	1	\N	\N	\N
38f66047-8b31-4ac4-9c0f-fd06a1e1ccac	-6	69	63	Play on server Ariuan's Server	2026-05-20 15:56:04.018	844193954756689921	1	\N	\N	\N
0f893cdd-454f-4bc0-9399-9937e94a3fdb	-6	63	57	Play on server Ariuan's Server	2026-05-20 16:02:09.939	844193954756689921	1	\N	\N	\N
be696c71-a4b2-4466-95e5-59f72badbf4a	-6	57	51	Play on server Ariuan's Server	2026-05-20 16:07:35.154	844193954756689921	1	\N	\N	\N
83e81ffe-e670-4881-9cc9-5ebf908c4420	-6	51	45	Play on server Ariuan's Server	2026-05-20 16:15:55.098	844193954756689921	1	\N	\N	\N
c519b8b1-b844-4c35-bcc3-c19cfdecd6c0	-6	45	39	Play on server Ariuan's Server	2026-05-20 16:22:15.303	844193954756689921	1	\N	\N	\N
7a77a53b-71e0-42f5-9fa3-c7e247dc05ff	-6	39	33	Play on server Ariuan's Server	2026-05-20 16:27:43.693	844193954756689921	1	\N	\N	\N
54b68cd4-3843-4ceb-8b84-7986f41ff45b	100	172	272	Daily Gift	2026-05-21 06:00:10.698	645919565758464010	\N	\N	\N	\N
acc70fae-de09-4bf6-a1ac-05d9ce8b3c7b	100	29	129	Daily Gift	2026-05-21 06:00:11.95	780972375394091009	\N	\N	\N	\N
484838ff-2b11-4af7-8796-7c022c2e52f4	100	33	133	Daily Gift	2026-05-21 06:00:12.384	844193954756689921	\N	\N	\N	\N
0e19679b-ebb0-459c-8dd6-f2904bbf65ca	-30	129	99	New Start Server Poll	2026-05-21 11:16:53.035	780972375394091009	1	\N	\N	\N
5930e6bc-1aaf-4a42-8ade-8312a4e784b5	-30	99	69	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-21 11:16:56.197	780972375394091009	1	\N	\N	\N
1c434b74-db07-43ca-9e59-45d57c25de3e	-30	133	103	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-21 11:18:10.815	844193954756689921	1	\N	\N	\N
5ef55fef-371e-4c2e-93c6-70cd3aeb010e	-30	272	242	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-21 11:37:26.484	645919565758464010	1	\N	\N	\N
a2398ff6-6c41-4254-abed-a92cd834a78e	-6	103	97	Play on server Ariuan's Server	2026-05-21 11:51:53.849	844193954756689921	1	\N	\N	\N
201e5b35-e9cb-42e7-8c12-70ed5c196e03	-6	97	91	Play on server Ariuan's Server	2026-05-21 11:57:23.438	844193954756689921	1	\N	\N	\N
d384821c-8368-4687-81f2-c7f7ce98519a	-6	91	85	Play on server Ariuan's Server	2026-05-21 12:03:04.944	844193954756689921	1	\N	\N	\N
22a8c192-b17c-4cdc-9e0b-299d741464c2	-6	85	79	Play on server Ariuan's Server	2026-05-21 12:09:21.155	844193954756689921	1	\N	\N	\N
04d70c06-8fc0-4652-96a8-8ad8e9f6a4b4	-6	79	73	Play on server Ariuan's Server	2026-05-21 12:15:10.342	844193954756689921	1	\N	\N	\N
71b64277-7bde-4d02-a433-3a54933da2dd	-6	73	67	Play on server Ariuan's Server	2026-05-21 12:23:30.361	844193954756689921	1	\N	\N	\N
e865485c-4090-485a-b9cb-4266081f8147	-6	67	61	Play on server Ariuan's Server	2026-05-21 12:31:50.327	844193954756689921	1	\N	\N	\N
d499902d-a70a-4774-8c98-cb058dd39525	-6	61	55	Play on server Ariuan's Server	2026-05-21 12:40:10.342	844193954756689921	1	\N	\N	\N
082203ce-6cdf-4e68-b6dd-168404b9f1e3	-6	55	49	Play on server Ariuan's Server	2026-05-21 12:48:30.338	844193954756689921	1	\N	\N	\N
2ebe768c-3f9f-43f9-badd-73cec79784a5	-6	49	43	Play on server Ariuan's Server	2026-05-21 12:56:50.316	844193954756689921	1	\N	\N	\N
4620aa90-8386-4d03-bd31-0549aa76aec3	-6	43	37	Play on server Ariuan's Server	2026-05-21 13:05:10.329	844193954756689921	1	\N	\N	\N
03414175-f1eb-4313-9d96-506d7477315d	-6	37	31	Play on server Ariuan's Server	2026-05-21 13:13:30.328	844193954756689921	1	\N	\N	\N
1b5a583b-4369-4742-a6bb-7f3d6dbcd20c	-6	31	25	Play on server Ariuan's Server	2026-05-21 13:21:50.327	844193954756689921	1	\N	\N	\N
bb4cd2b5-2664-40ba-bf37-d675f375a5bd	-6	25	19	Play on server Ariuan's Server	2026-05-21 13:30:10.408	844193954756689921	1	\N	\N	\N
db5b5371-6daf-4b42-8da5-cfcf74f78c0a	-6	242	236	Play on server Ariuan's Server	2026-05-21 13:31:50.046	645919565758464010	1	\N	\N	\N
aced7f3f-188a-428f-949c-df321fd5e229	-6	19	13	Play on server Ariuan's Server	2026-05-21 13:38:30.416	844193954756689921	1	\N	\N	\N
bcc1aa7e-9030-467a-bc61-3fb6af9f899e	-6	236	230	Play on server Ariuan's Server	2026-05-21 13:40:10.062	645919565758464010	1	\N	\N	\N
a1eb9bdc-b8db-47e7-ba39-3bb24c46f6e7	-6	13	7	Play on server Ariuan's Server	2026-05-21 13:46:50.427	844193954756689921	1	\N	\N	\N
35760cc3-b1b9-48e5-83cc-c4904bdb8498	-6	230	224	Play on server Ariuan's Server	2026-05-21 13:48:30.08	645919565758464010	1	\N	\N	\N
fcbf45eb-b048-4462-9ec4-ea0fb071220c	-6	224	218	Play on server Ariuan's Server	2026-05-21 13:56:50.08	645919565758464010	1	\N	\N	\N
cfea79eb-72f2-49e9-ad7d-140bce9d63b9	-6	218	212	Play on server Ariuan's Server	2026-05-21 14:05:10.048	645919565758464010	1	\N	\N	\N
5081c720-5356-4949-b56b-bc0518fb4e16	-6	212	206	Play on server Ariuan's Server	2026-05-21 14:13:30.059	645919565758464010	1	\N	\N	\N
e7f11a9b-f6a7-4c06-a371-e755cb93795f	-6	206	200	Play on server Ariuan's Server	2026-05-21 14:21:50.049	645919565758464010	1	\N	\N	\N
f736ecbb-b4c3-4ea4-b2e5-5df64db0c137	-6	200	194	Play on server Ariuan's Server	2026-05-21 14:30:10.04	645919565758464010	1	\N	\N	\N
05c1c7e7-b533-4b5f-ae55-b61a958aa173	-6	194	188	Play on server Ariuan's Server	2026-05-21 14:38:30.067	645919565758464010	1	\N	\N	\N
03ae1e1f-b545-41a5-a0f7-285edaea8030	-6	188	182	Play on server Ariuan's Server	2026-05-21 14:46:50.055	645919565758464010	1	\N	\N	\N
42f96577-0caa-4b5b-b068-b1c24c046bc6	-6	182	176	Play on server Ariuan's Server	2026-05-21 14:55:10.055	645919565758464010	1	\N	\N	\N
7a04ce55-3baa-4ff6-bc7f-cd9713db353e	-6	176	170	Play on server Ariuan's Server	2026-05-21 15:03:30.072	645919565758464010	1	\N	\N	\N
f033bda2-8b6d-48cb-85c8-c8a0e7f16e85	-6	170	164	Play on server Ariuan's Server	2026-05-21 15:11:50.057	645919565758464010	1	\N	\N	\N
f2eca36f-061c-49ed-ae3c-c083e6bf2ac9	-6	164	158	Play on server Ariuan's Server	2026-05-21 15:20:10.057	645919565758464010	1	\N	\N	\N
46d414f6-038c-4b33-abbc-f06689c67997	100	7	107	Daily Gift	2026-05-22 06:00:11.264	844193954756689921	\N	\N	\N	\N
feaa614c-df70-4493-ab73-4aad5002c1fa	100	158	258	Daily Gift	2026-05-22 06:00:11.803	645919565758464010	\N	\N	\N	\N
369e04ec-5756-4667-95c8-5cb3c5a07d93	100	69	169	Daily Gift	2026-05-22 06:00:12.648	780972375394091009	\N	\N	\N	\N
0bcd59e9-9f21-4928-877a-fd2efc695c35	-30	169	139	New Start Server Poll	2026-05-22 14:32:40.727	780972375394091009	1	\N	\N	\N
1eb9eded-cf62-4e33-8c36-7481d952d89e	-30	139	109	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-22 14:32:43.9	780972375394091009	1	\N	\N	\N
9d815fc0-79fb-4db0-ad93-2babbeac6add	-30	107	77	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-22 14:35:15.066	844193954756689921	1	\N	\N	\N
12f80ca8-9977-437b-8cef-af6569478ecc	100	109	209	Daily Gift	2026-05-23 06:00:11.769	780972375394091009	\N	\N	\N	\N
eb9c9c01-7138-46fe-ada5-0ab9a8749187	100	77	177	Daily Gift	2026-05-23 06:00:12.362	844193954756689921	\N	\N	\N	\N
f3bf2b86-3aee-4260-8fa6-6e135a7a556a	-30	209	179	New Start Server Poll	2026-05-23 11:42:41.791	780972375394091009	1	\N	\N	\N
48a6c0ea-f855-4228-af93-34009d78b7e1	-30	179	149	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-23 11:42:45.514	780972375394091009	1	\N	\N	\N
0afe62c7-40b8-45eb-baf7-721c764c5a85	-30	391	361	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-23 12:10:56.169	709605543358234674	1	\N	\N	\N
4328e0b2-0205-4a68-ab0b-69cf24497614	-6	149	143	Play on server Ariuan's Server	2026-05-23 13:38:53.545	780972375394091009	1	\N	\N	\N
6d6aea95-2961-4fca-b3c0-94de33a95404	-6	143	137	Play on server Ariuan's Server	2026-05-23 13:47:13.554	780972375394091009	1	\N	\N	\N
58dfdb9f-b76c-49fb-860d-330c2fe8065c	-6	137	131	Play on server Ariuan's Server	2026-05-23 13:55:33.542	780972375394091009	1	\N	\N	\N
af54dc6e-0c27-456d-9802-03c2349d9401	-6	131	125	Play on server Ariuan's Server	2026-05-23 14:03:53.567	780972375394091009	1	\N	\N	\N
f3696b57-f845-442b-b9e8-07ecdcae8d15	-6	125	119	Play on server Ariuan's Server	2026-05-23 14:12:13.566	780972375394091009	1	\N	\N	\N
5d61e339-4206-4883-8143-7357a178407d	-6	119	113	Play on server Ariuan's Server	2026-05-23 14:20:33.558	780972375394091009	1	\N	\N	\N
af727598-45ce-4c36-bd0f-34fb62f21097	-6	113	107	Play on server Ariuan's Server	2026-05-23 14:28:53.568	780972375394091009	1	\N	\N	\N
c306e4f5-6790-4516-a045-543719c5b238	-6	107	101	Play on server Ariuan's Server	2026-05-23 14:37:13.572	780972375394091009	1	\N	\N	\N
19bb9de5-3995-4011-b966-5fdf3a33539f	-6	101	95	Play on server Ariuan's Server	2026-05-23 14:45:34.47	780972375394091009	1	\N	\N	\N
0edf0f9d-da1b-493c-953b-c5c4a01aa7ab	-6	95	89	Play on server Ariuan's Server	2026-05-23 14:53:54.488	780972375394091009	1	\N	\N	\N
c88f179a-4b57-4b1d-bd31-14908fd14d3f	-6	89	83	Play on server Ariuan's Server	2026-05-23 15:02:14.478	780972375394091009	1	\N	\N	\N
be075696-d561-4494-af0d-97898fe6a5cf	-6	83	77	Play on server Ariuan's Server	2026-05-23 15:10:34.478	780972375394091009	1	\N	\N	\N
633071b7-c720-490f-b904-7ed65cee5b25	-6	361	355	Play on server Ariuan's Server	2026-05-23 15:12:57.871	709605543358234674	1	\N	\N	\N
1c740e45-562d-4c88-a043-5a21b5d34fef	-6	77	71	Play on server Ariuan's Server	2026-05-23 15:18:54.447	780972375394091009	1	\N	\N	\N
c84e8485-7b67-49c8-8d6d-021e386feb7f	-6	355	349	Play on server Ariuan's Server	2026-05-23 15:21:17.879	709605543358234674	1	\N	\N	\N
bfc42dfe-6c4e-4f1e-a2ff-b77f917686c7	-6	71	65	Play on server Ariuan's Server	2026-05-23 15:27:14.438	780972375394091009	1	\N	\N	\N
426ce2ea-8e48-4afc-962b-6b2729952804	-6	349	343	Play on server Ariuan's Server	2026-05-23 15:29:37.869	709605543358234674	1	\N	\N	\N
a27f82cf-b5bd-4920-9afa-54de850e60b2	-6	65	59	Play on server Ariuan's Server	2026-05-23 15:35:34.434	780972375394091009	1	\N	\N	\N
8042ce36-5daf-4d60-9c5a-98346b3b6342	-6	343	337	Play on server Ariuan's Server	2026-05-23 15:37:57.868	709605543358234674	1	\N	\N	\N
0e32f490-f898-4859-a9a7-36e55d123fb9	-6	59	53	Play on server Ariuan's Server	2026-05-23 15:43:54.448	780972375394091009	1	\N	\N	\N
cef66e94-97fc-4207-873f-f88e081aadaf	-6	337	331	Play on server Ariuan's Server	2026-05-23 15:46:17.881	709605543358234674	1	\N	\N	\N
fb19e690-5fdf-425f-bbb5-36041ac15403	-6	53	47	Play on server Ariuan's Server	2026-05-23 15:52:14.437	780972375394091009	1	\N	\N	\N
d4d6b1ce-feec-4083-8654-7a4b8efd5da6	-6	331	325	Play on server Ariuan's Server	2026-05-23 15:54:37.876	709605543358234674	1	\N	\N	\N
87a7412b-b20b-4396-a4cb-ff823482bf3d	-6	47	41	Play on server Ariuan's Server	2026-05-23 16:00:34.442	780972375394091009	1	\N	\N	\N
7d8fc202-ab26-4a84-916f-fd7e55265945	-6	325	319	Play on server Ariuan's Server	2026-05-23 16:02:57.871	709605543358234674	1	\N	\N	\N
829d5fb7-0866-4c4a-8245-ae2f8e63177e	-6	41	35	Play on server Ariuan's Server	2026-05-23 16:08:54.455	780972375394091009	1	\N	\N	\N
e5a57538-ba9d-4030-879e-703d1fcf8d09	-6	319	313	Play on server Ariuan's Server	2026-05-23 16:11:17.877	709605543358234674	1	\N	\N	\N
bc587c5c-f59e-474e-adab-73715a880fc3	-6	35	29	Play on server Ariuan's Server	2026-05-23 16:17:14.448	780972375394091009	1	\N	\N	\N
9f320733-76b2-4750-938f-128597e44c02	-6	313	307	Play on server Ariuan's Server	2026-05-23 16:19:37.869	709605543358234674	1	\N	\N	\N
502f735d-1073-49d8-b68a-ebf5be21ffa6	-6	29	23	Play on server Ariuan's Server	2026-05-23 16:25:34.43	780972375394091009	1	\N	\N	\N
fce5200f-1cfb-4cd7-8355-5673fdc80403	-6	307	301	Play on server Ariuan's Server	2026-05-23 16:27:57.868	709605543358234674	1	\N	\N	\N
b963d3bf-1e01-4abb-9a11-415a6de7a438	-6	23	17	Play on server Ariuan's Server	2026-05-23 16:33:54.451	780972375394091009	1	\N	\N	\N
ca43cd50-0c87-4800-bb0a-8abbd3e8c8a1	-6	301	295	Play on server Ariuan's Server	2026-05-23 16:36:17.882	709605543358234674	1	\N	\N	\N
cdd403a9-b704-456b-90f3-258805e11286	-6	17	11	Play on server Ariuan's Server	2026-05-23 16:42:14.436	780972375394091009	1	\N	\N	\N
7bbb49af-e75c-4408-993a-d7ff9a3f9dd9	-6	11	5	Play on server Ariuan's Server	2026-05-23 16:50:34.43	780972375394091009	1	\N	\N	\N
aa87307e-1a5d-47ca-bce3-b0256d8b1e42	100	5	105	Daily Gift	2026-05-24 06:00:12.34	780972375394091009	\N	\N	\N	\N
747a8235-2ee2-4e67-a202-ec075964b071	100	177	277	Daily Gift	2026-05-24 06:00:12.907	844193954756689921	\N	\N	\N	\N
d676806c-4cbf-406a-bee4-f769d80eb7b4	-30	105	75	New Start Server Poll	2026-05-24 12:28:43.686	780972375394091009	1	\N	\N	\N
6d8f9e5d-b63a-4eca-bdad-aea7059475ec	-30	75	45	Approval Poll Reaction: Start Server at Ariuan's Server	2026-05-24 12:28:46.472	780972375394091009	1	\N	\N	\N
b483c216-edb8-4de2-99f9-c13f44ee34d8	30	45	75	Approval Reaction Refund	2026-05-24 13:46:24.327	780972375394091009	1	\N	\N	\N
c1a12883-851a-47b1-97d1-3006f8f3f379	100	75	175	Daily Gift	2026-05-25 06:00:12.853	780972375394091009	\N	\N	\N	\N
4f104910-db38-4164-a3ea-2eb3d9f40502	100	175	275	Daily Gift	2026-05-26 06:00:13.31	780972375394091009	\N	\N	\N	\N
dd53f6aa-212a-4cfb-bdb9-b97d2d2ee98f	-30	258	228	New Start Server Poll	2026-06-01 10:49:19.298	645919565758464010	1	\N	\N	\N
eb407130-9613-486a-b6ab-35903bc059c3	-30	228	198	Approval Poll Reaction: Start Server at Ariuan's Server	2026-06-01 10:49:24.065	645919565758464010	1	\N	\N	\N
a3abb1af-09e6-40a8-bd8e-88bca6e70ee6	-30	275	245	Approval Poll Reaction: Start Server at Ariuan's Server	2026-06-01 10:49:38.846	780972375394091009	1	\N	\N	\N
9aa55190-a2fb-493d-bd50-530e67ad3a4b	-6	198	192	Play on server Ariuan's Server	2026-06-01 11:31:57.027	645919565758464010	1	\N	\N	\N
aeb6593e-c9b8-4263-89fe-ba9a6791166d	-6	192	186	Play on server Ariuan's Server	2026-06-01 11:40:17.006	645919565758464010	1	\N	\N	\N
0b07501d-cd79-48b1-ba6e-c7093f163e14	-6	245	239	Play on server Ariuan's Server	2026-06-01 11:41:01.498	780972375394091009	1	\N	\N	\N
3d340cd1-139b-405f-8cfa-7df8d69871de	-6	186	180	Play on server Ariuan's Server	2026-06-01 11:48:37.016	645919565758464010	1	\N	\N	\N
9b49a8ed-8d9c-4536-b397-9abc6a8a1639	-6	239	233	Play on server Ariuan's Server	2026-06-01 11:49:21.521	780972375394091009	1	\N	\N	\N
41afded9-54cc-4f73-bc1d-59c9593fe67b	-6	180	174	Play on server Ariuan's Server	2026-06-01 11:56:56.999	645919565758464010	1	\N	\N	\N
340259a5-8b20-48d4-a4d6-daf06f205961	-6	233	227	Play on server Ariuan's Server	2026-06-01 11:57:41.509	780972375394091009	1	\N	\N	\N
6eb7fec4-977e-426f-96d3-daab03e0a62b	-6	174	168	Play on server Ariuan's Server	2026-06-01 12:05:17.003	645919565758464010	1	\N	\N	\N
6a594c10-9a57-4ef9-b029-016d9476eb88	-6	227	221	Play on server Ariuan's Server	2026-06-01 12:06:01.523	780972375394091009	1	\N	\N	\N
b11fac8e-0fa1-4443-be21-71c3a03e5da7	-6	168	162	Play on server Ariuan's Server	2026-06-01 12:13:37.034	645919565758464010	1	\N	\N	\N
fa9e62f2-bdf4-4c57-8235-a14ad3a96ccc	-6	221	215	Play on server Ariuan's Server	2026-06-01 12:18:06.816	780972375394091009	1	\N	\N	\N
735081d8-2a4d-4040-8911-f12fbb3a36eb	-6	162	156	Play on server Ariuan's Server	2026-06-01 12:21:57.014	645919565758464010	1	\N	\N	\N
6fa92c57-99f0-421b-8379-c21094c67f57	-6	215	209	Play on server Ariuan's Server	2026-06-01 12:26:26.816	780972375394091009	1	\N	\N	\N
fb0a4954-3392-4a13-996f-d4cc81526f9c	-6	156	150	Play on server Ariuan's Server	2026-06-01 12:30:17.007	645919565758464010	1	\N	\N	\N
e969ee5d-2f1d-4515-9f89-6912a6ef733f	-6	209	203	Play on server Ariuan's Server	2026-06-01 12:34:46.829	780972375394091009	1	\N	\N	\N
228f1446-4590-4b9e-b236-b03986441c06	-6	150	144	Play on server Ariuan's Server	2026-06-01 12:38:37.023	645919565758464010	1	\N	\N	\N
cd1aaa1a-71ef-4ce5-821b-cfcb37b98fbc	-6	203	197	Play on server Ariuan's Server	2026-06-01 12:43:06.808	780972375394091009	1	\N	\N	\N
037c7bc4-a62d-4fa3-b732-0f404e36937a	-6	144	138	Play on server Ariuan's Server	2026-06-01 12:46:57.021	645919565758464010	1	\N	\N	\N
72e4a346-63e0-4176-9409-0975e19e5583	-6	197	191	Play on server Ariuan's Server	2026-06-01 12:51:26.819	780972375394091009	1	\N	\N	\N
dc305a2a-fc5c-4ada-a47f-2fbe91483373	-6	138	132	Play on server Ariuan's Server	2026-06-01 12:55:17.004	645919565758464010	1	\N	\N	\N
a5ebc173-f370-463d-96f0-4729e91746b8	-6	191	185	Play on server Ariuan's Server	2026-06-01 12:59:46.831	780972375394091009	1	\N	\N	\N
0a2c721a-0f5b-4925-9d72-afd1fe727cb7	-6	132	126	Play on server Ariuan's Server	2026-06-01 13:03:37.03	645919565758464010	1	\N	\N	\N
3238ad3d-5cd9-4ff6-9643-496cb8d6c17a	-6	126	120	Play on server Ariuan's Server	2026-06-01 13:11:57.022	645919565758464010	1	\N	\N	\N
a26905f6-1cc5-40d7-9738-7310607855cd	-6	185	179	Play on server Ariuan's Server	2026-06-01 13:18:13.909	780972375394091009	1	\N	\N	\N
9c7de60b-accb-4e24-81da-1d80c1464295	-6	120	114	Play on server Ariuan's Server	2026-06-01 13:20:17.04	645919565758464010	1	\N	\N	\N
8a58fd0f-38bf-40bd-9a78-743f927cc29b	-6	179	173	Play on server Ariuan's Server	2026-06-01 13:26:33.96	780972375394091009	1	\N	\N	\N
683af27e-7524-43cf-875f-9cef1ef558b7	-6	173	167	Play on server Ariuan's Server	2026-06-01 13:34:53.947	780972375394091009	1	\N	\N	\N
2c8433ef-2e91-4a5b-a3a4-582e693c8b98	-6	114	108	Play on server Ariuan's Server	2026-06-01 13:36:34.647	645919565758464010	1	\N	\N	\N
04108d36-7d7b-4239-ba64-0d4d59e2f33f	-6	167	161	Play on server Ariuan's Server	2026-06-01 13:43:13.96	780972375394091009	1	\N	\N	\N
63deb7a8-f335-42ea-a4f5-3809cd92f809	-6	108	102	Play on server Ariuan's Server	2026-06-01 13:44:54.654	645919565758464010	1	\N	\N	\N
4ed1b971-8183-48e7-9d77-2835ac039dac	-6	161	155	Play on server Ariuan's Server	2026-06-01 13:51:33.986	780972375394091009	1	\N	\N	\N
37668567-7ac8-4f52-9c18-99dde5f1c7ee	-6	102	96	Play on server Ariuan's Server	2026-06-01 13:53:14.654	645919565758464010	1	\N	\N	\N
0100af9a-4f0c-4dd3-a8c5-f148da5eac85	-6	155	149	Play on server Ariuan's Server	2026-06-01 13:59:53.96	780972375394091009	1	\N	\N	\N
48a3fe60-822a-465e-b087-4c36006cc82b	-6	96	90	Play on server Ariuan's Server	2026-06-01 14:01:34.673	645919565758464010	1	\N	\N	\N
4f282a8f-acf8-43a9-a7ff-0bfcbcd70646	-6	149	143	Play on server Ariuan's Server	2026-06-01 14:08:13.976	780972375394091009	1	\N	\N	\N
96f9beec-47b7-4dab-a026-37f2eb9905ab	-6	90	84	Play on server Ariuan's Server	2026-06-01 14:09:54.665	645919565758464010	1	\N	\N	\N
682197b8-17f3-4688-b1e0-12421597b8ac	-6	143	137	Play on server Ariuan's Server	2026-06-01 14:16:33.992	780972375394091009	1	\N	\N	\N
0043764e-2359-45dc-bb29-530e8fb861d0	-6	84	78	Play on server Ariuan's Server	2026-06-01 14:18:14.668	645919565758464010	1	\N	\N	\N
fda097dd-0788-44a0-8d37-e796f2325dde	-6	78	72	Play on server Ariuan's Server	2026-06-01 14:26:34.684	645919565758464010	1	\N	\N	\N
172492e4-cd35-419c-ae16-9057c38c1939	-6	72	66	Play on server Ariuan's Server	2026-06-01 14:34:54.685	645919565758464010	1	\N	\N	\N
58270e83-2bfe-4dd5-b667-1b5da768e5ee	-6	66	60	Play on server Ariuan's Server	2026-06-01 14:43:14.653	645919565758464010	1	\N	\N	\N
64b38dbb-57f7-4425-9956-a9580c6cdb4f	100	137	237	Daily Gift	2026-06-02 06:00:16.753	780972375394091009	\N	\N	\N	\N
4b053bf3-f98b-4bc8-8ada-7863f9500a37	100	60	160	Daily Gift	2026-06-02 06:00:17.214	645919565758464010	\N	\N	\N	\N
2ce2f0b0-c14a-4e6c-9fed-6771fd265530	100	160	260	Daily Gift	2026-06-03 06:00:17.354	645919565758464010	\N	\N	\N	\N
33758e3e-3256-4ed3-b4ca-f36b3b5125e8	-6	296	290	Play on server Ariuan's Server	2026-06-04 17:35:43.061	658305794038825030	1	\N	\N	\N
05eb3734-c785-4cd6-b07b-86194bad7e9e	-6	277	271	Play on server Ariuan's Server	2026-06-04 17:37:22.05	844193954756689921	1	\N	\N	\N
f119056b-1c33-4e37-8140-57922d6aa8cd	-6	290	284	Play on server Ariuan's Server	2026-06-04 17:44:03.067	658305794038825030	1	\N	\N	\N
497df5d2-f1b4-47e0-a790-4230867d51e0	-6	271	265	Play on server Ariuan's Server	2026-06-04 17:45:42.07	844193954756689921	1	\N	\N	\N
b5920829-b1ec-4425-8980-35c43d91568a	-6	237	231	Play on server Ariuan's Server	2026-06-04 17:46:14.904	780972375394091009	1	\N	\N	\N
e21c0f7a-cc47-42ed-bae2-048191ebe6a3	-6	284	278	Play on server Ariuan's Server	2026-06-04 17:52:23.076	658305794038825030	1	\N	\N	\N
f423ce2d-09d1-4a28-8545-bad861ad076f	-20	293	273	Approval Poll Reaction: difficulty hard	2026-06-04 17:52:41.872	634021280529645569	1	\N	\N	\N
de4491a6-b782-483f-aeea-f1978f772013	-20	265	245	Approval Poll Reaction: difficulty hard	2026-06-04 17:52:45.804	844193954756689921	1	\N	\N	\N
7c8f4d93-3f59-4f39-bc5d-ef412d66d991	-20	231	211	Approval Poll Reaction: difficulty hard	2026-06-04 17:52:50.398	780972375394091009	1	\N	\N	\N
7a3ee41d-e67c-432e-978e-3d952a07d3f9	-6	245	239	Play on server Ariuan's Server	2026-06-04 17:54:02.077	844193954756689921	1	\N	\N	\N
ac0f7e8c-31e6-470b-a1ba-bfde6fe33196	-6	211	205	Play on server Ariuan's Server	2026-06-04 17:54:34.926	780972375394091009	1	\N	\N	\N
5b5a1be5-d50b-4bd0-9375-862ab85edb02	-6	205	199	Play on server Ariuan's Server	2026-06-04 17:56:49.592	780972375394091009	1	\N	\N	\N
fa462a50-c00d-4d05-802a-388ec300cb82	-6	278	272	Play on server Ariuan's Server	2026-06-04 17:57:12.1	658305794038825030	1	\N	\N	\N
2108327e-ccca-45c3-9a45-22dce673b07e	-6	239	233	Play on server Ariuan's Server	2026-06-04 17:57:22.756	844193954756689921	1	\N	\N	\N
15ee4fd8-01af-4d38-8792-688645300cb6	-6	272	266	Play on server Ariuan's Server	2026-06-04 18:05:32.219	658305794038825030	1	\N	\N	\N
268dc4fe-2348-4a29-b654-0a3b04e6a207	-6	233	227	Play on server Ariuan's Server	2026-06-04 18:05:42.856	844193954756689921	1	\N	\N	\N
26798b05-8714-49f5-8a14-b7c23df6d6b8	-6	227	221	Play on server Ariuan's Server	2026-06-04 18:14:02.87	844193954756689921	1	\N	\N	\N
98531e22-c875-4dd3-9be3-c079252f3d27	-6	221	215	Play on server Ariuan's Server	2026-06-04 18:16:47.838	844193954756689921	1	\N	\N	\N
28aaaaef-9f68-444c-b321-d1c8ae53631f	-6	266	260	Play on server Ariuan's Server	2026-06-04 18:17:17.92	658305794038825030	1	\N	\N	\N
a07b1c7f-4ca2-41ef-94e2-420d155272ca	-6	273	267	Play on server Ariuan's Server	2026-06-04 18:19:51.307	634021280529645569	1	\N	\N	\N
1d6da0ce-ec80-4900-95a3-848b95d13243	-6	260	254	Play on server Ariuan's Server	2026-06-04 18:25:37.931	658305794038825030	1	\N	\N	\N
3590d5a7-0bcc-433f-ab18-24c40913c415	-6	215	209	Play on server Ariuan's Server	2026-06-04 18:25:44.3	844193954756689921	1	\N	\N	\N
d3cfc139-ba6d-4cbf-a4d5-000524244b42	-6	267	261	Play on server Ariuan's Server	2026-06-04 18:27:32.661	634021280529645569	1	\N	\N	\N
5b76138d-4e3a-4719-b99f-24a041592690	-6	254	248	Play on server Ariuan's Server	2026-06-04 18:33:57.916	658305794038825030	1	\N	\N	\N
11508d83-b689-4c10-b805-8eef77902b36	-6	209	203	Play on server Ariuan's Server	2026-06-04 18:34:04.301	844193954756689921	1	\N	\N	\N
ce8dd7fc-92fc-48d4-99f0-6affb8748a4c	-6	261	255	Play on server Ariuan's Server	2026-06-04 18:35:52.659	634021280529645569	1	\N	\N	\N
71a5f06c-3833-4652-89e7-4c754737fd85	-6	248	242	Play on server Ariuan's Server	2026-06-04 18:42:17.931	658305794038825030	1	\N	\N	\N
a19d98b0-c7a8-443e-9d07-de1d48efb943	-6	203	197	Play on server Ariuan's Server	2026-06-04 18:42:24.299	844193954756689921	1	\N	\N	\N
18439608-426c-4114-b964-c49f4ea0f39d	-6	255	249	Play on server Ariuan's Server	2026-06-04 18:44:12.658	634021280529645569	1	\N	\N	\N
241963cb-a8da-428f-a1d5-e4b50e8cf0e7	-6	242	236	Play on server Ariuan's Server	2026-06-04 18:50:37.935	658305794038825030	1	\N	\N	\N
2919b1c9-3478-4b29-8257-5658669debe3	-6	197	191	Play on server Ariuan's Server	2026-06-04 18:50:44.3	844193954756689921	1	\N	\N	\N
3b0a9595-3455-46ab-8684-437a3516d2fd	-6	249	243	Play on server Ariuan's Server	2026-06-04 18:52:32.656	634021280529645569	1	\N	\N	\N
cb1b453e-2722-4536-ac5a-419c712d73bd	-6	236	230	Play on server Ariuan's Server	2026-06-04 18:58:57.951	658305794038825030	1	\N	\N	\N
f2efee43-b228-49e0-b141-76421341ecb8	-6	191	185	Play on server Ariuan's Server	2026-06-04 18:59:04.336	844193954756689921	1	\N	\N	\N
d0831e20-98df-48f4-a8a1-2e88cb7a464a	-6	243	237	Play on server Ariuan's Server	2026-06-04 19:00:52.706	634021280529645569	1	\N	\N	\N
a3859343-4ef0-4e52-95bb-8665bfa45fef	-6	230	224	Play on server Ariuan's Server	2026-06-04 19:07:18.002	658305794038825030	1	\N	\N	\N
9b605409-58be-4e08-ad46-a25fbae93e09	-6	185	179	Play on server Ariuan's Server	2026-06-04 19:07:24.357	844193954756689921	1	\N	\N	\N
c9b5dc9b-cc7d-441f-81de-bb50acd8bec7	-6	237	231	Play on server Ariuan's Server	2026-06-04 19:07:54.827	634021280529645569	1	\N	\N	\N
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."User" (id, credits, permission) FROM stdin;
709605543358234674	295	425993
645919565758464010	260	425993
780972375394091009	199	425993
804333943775559680	288	425993
841246467536584704	288	425993
843689770395238422	0	131072
682085897008971776	0	131072
800640811171446794	0	131072
1372227913923039312	0	393216
950063797358428260	65	393216
825752488388329514	0	393216
713930443027644477	0	393216
658305794038825030	224	134217727
844193954756689921	179	425993
666239646711414787	260	32777
634021280529645569	231	425993
678185861275189258	850	1476617
\.


--
-- Data for Name: UserTicket; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."UserTicket" (id, "ticketId", "userId", reason, "maxUse", "createdAt", "updatedAt", "expiresAt") FROM stdin;
e8f02ad3-42b5-4cea-8077-018f81d646ff	test	658305794038825030	Added by ariuaniris.	2	2025-12-10 13:21:36.352	2025-12-10 13:21:36.352	\N
b475f16a-db06-4cc4-9002-774024ad4e6d	cobblemonCelebration	709605543358234674	Added by ariuaniris.	1	2025-12-10 14:24:10.281	2025-12-10 14:24:10.281	2025-12-15 14:24:10.277
acc5bffd-7019-4b60-a8a1-4166525a5344	cobblemonCelebration	709605543358234674	Added by ariuaniris.	1	2025-12-10 14:24:10.286	2025-12-10 14:24:10.286	2025-12-15 14:24:10.277
921be6d0-9eae-46cf-8431-c5331949bc99	cobblemonCelebration	709605543358234674	Added by ariuaniris.	1	2025-12-10 14:24:10.288	2025-12-10 14:24:10.288	2025-12-15 14:24:10.277
dad86593-9008-4afa-abe0-a1f5a7e35440	cobblemonCelebration	709605543358234674	Added by ariuaniris.	1	2025-12-10 14:24:10.291	2025-12-10 14:24:10.291	2025-12-15 14:24:10.277
d0bea742-bbe2-449b-89e9-44723b9b4ca6	cobblemonCelebration	709605543358234674	Added by ariuaniris.	1	2025-12-10 14:24:10.293	2025-12-10 14:24:10.293	2025-12-15 14:24:10.277
c092f54a-ace4-4e1c-994e-880cc71b14a9	cobblemonCelebration	678185861275189258	Added by ariuaniris.	1	2025-12-10 14:24:10.295	2025-12-10 14:24:10.295	2025-12-15 14:24:10.277
ad2ea07d-b351-48ef-a933-fbbe571ee692	cobblemonCelebration	678185861275189258	Added by ariuaniris.	1	2025-12-10 14:24:10.297	2025-12-10 14:24:10.297	2025-12-15 14:24:10.277
bd7dabbd-4a43-4f8d-a138-20b219523c9b	cobblemonCelebration	678185861275189258	Added by ariuaniris.	1	2025-12-10 14:24:10.299	2025-12-10 14:24:10.299	2025-12-15 14:24:10.277
dd157a88-6e96-4852-a7aa-33070fcfa506	cobblemonCelebration	678185861275189258	Added by ariuaniris.	1	2025-12-10 14:24:10.303	2025-12-10 14:24:10.303	2025-12-15 14:24:10.277
5673ff09-8f50-4138-a352-f63c201aacd1	cobblemonCelebration	678185861275189258	Added by ariuaniris.	1	2025-12-10 14:24:10.305	2025-12-10 14:24:10.305	2025-12-15 14:24:10.277
eadcc534-eed8-4312-a899-013a9da780ae	cobblemonCelebration	1372227913923039312	Added by ariuaniris.	1	2025-12-10 14:24:10.307	2025-12-10 14:24:10.307	2025-12-15 14:24:10.277
bc4288ed-6ba2-4367-8bce-3b7895c152bb	cobblemonCelebration	1372227913923039312	Added by ariuaniris.	1	2025-12-10 14:24:10.308	2025-12-10 14:24:10.308	2025-12-15 14:24:10.277
581652ae-fea3-4494-83e6-5f528566a5fa	cobblemonCelebration	1372227913923039312	Added by ariuaniris.	1	2025-12-10 14:24:10.31	2025-12-10 14:24:10.31	2025-12-15 14:24:10.277
0b26fc6a-5368-4e15-b880-c2de0b7b93ae	cobblemonCelebration	1372227913923039312	Added by ariuaniris.	1	2025-12-10 14:24:10.311	2025-12-10 14:24:10.311	2025-12-15 14:24:10.277
8ff75bd3-9794-4e0a-a8dd-359dbd2ca038	cobblemonCelebration	1372227913923039312	Added by ariuaniris.	1	2025-12-10 14:24:10.312	2025-12-10 14:24:10.312	2025-12-15 14:24:10.277
462539d9-ba75-4dae-ac21-a3a900f4f6aa	cobblemonCelebration	950063797358428260	Added by ariuaniris.	1	2025-12-10 14:24:10.314	2025-12-10 14:24:10.314	2025-12-15 14:24:10.277
f5e48f6e-4c2b-4505-8f84-410f401495c3	cobblemonCelebration	950063797358428260	Added by ariuaniris.	1	2025-12-10 14:24:10.315	2025-12-10 14:24:10.315	2025-12-15 14:24:10.277
f3302885-d011-466e-9ee5-a195c8d56317	cobblemonCelebration	950063797358428260	Added by ariuaniris.	1	2025-12-10 14:24:10.317	2025-12-10 14:24:10.317	2025-12-15 14:24:10.277
46b0e4ee-5d93-46ff-98fc-e7b9f7a04e85	cobblemonCelebration	950063797358428260	Added by ariuaniris.	1	2025-12-10 14:24:10.318	2025-12-10 14:24:10.318	2025-12-15 14:24:10.277
19960d96-4e53-45cd-965f-99195ac87894	cobblemonCelebration	950063797358428260	Added by ariuaniris.	1	2025-12-10 14:24:10.32	2025-12-10 14:24:10.32	2025-12-15 14:24:10.277
ece7e638-62c8-49f9-92d8-67b4db1655be	cobblemonCelebration	844193954756689921	Added by ariuaniris.	1	2025-12-10 14:24:10.322	2025-12-10 14:24:10.322	2025-12-15 14:24:10.277
a025b0c4-552f-4397-a7e7-5f56d2ce6fb1	cobblemonCelebration	844193954756689921	Added by ariuaniris.	1	2025-12-10 14:24:10.325	2025-12-10 14:24:10.325	2025-12-15 14:24:10.277
f7f806fa-3ff9-4b4b-952c-1c2c17966df7	cobblemonCelebration	844193954756689921	Added by ariuaniris.	1	2025-12-10 14:24:10.327	2025-12-10 14:24:10.327	2025-12-15 14:24:10.277
9d22768e-75c7-4694-9bf5-8b4f04d87844	cobblemonCelebration	844193954756689921	Added by ariuaniris.	1	2025-12-10 14:24:10.33	2025-12-10 14:24:10.33	2025-12-15 14:24:10.277
cc483a3c-bf10-4f38-a222-56246004e22f	cobblemonCelebration	844193954756689921	Added by ariuaniris.	1	2025-12-10 14:24:10.332	2025-12-10 14:24:10.332	2025-12-15 14:24:10.277
c69983e6-d7c6-415b-9250-b6808f6e486e	cobblemonCelebration	804333943775559680	Added by ariuaniris.	1	2025-12-10 14:24:10.335	2025-12-10 14:24:10.335	2025-12-15 14:24:10.277
65420fd0-1708-415e-9ad7-681f48ee56aa	cobblemonCelebration	804333943775559680	Added by ariuaniris.	1	2025-12-10 14:24:10.337	2025-12-10 14:24:10.337	2025-12-15 14:24:10.277
bff7faba-b2e7-441d-b069-668f0c51554d	cobblemonCelebration	804333943775559680	Added by ariuaniris.	1	2025-12-10 14:24:10.341	2025-12-10 14:24:10.341	2025-12-15 14:24:10.277
6f86d55c-5432-44cb-845f-8944642d87be	cobblemonCelebration	804333943775559680	Added by ariuaniris.	1	2025-12-10 14:24:10.343	2025-12-10 14:24:10.343	2025-12-15 14:24:10.277
182e102e-1f59-4be6-9e44-4c76d93ed5bc	cobblemonCelebration	804333943775559680	Added by ariuaniris.	1	2025-12-10 14:24:10.344	2025-12-10 14:24:10.344	2025-12-15 14:24:10.277
6c653126-8fb6-49d6-8832-d77b4b63a90b	cobblemonCelebration	841246467536584704	Added by ariuaniris.	1	2025-12-10 14:24:10.345	2025-12-10 14:24:10.345	2025-12-15 14:24:10.277
076e77f5-9ee3-49cc-a0da-f6101a17197f	cobblemonCelebration	841246467536584704	Added by ariuaniris.	1	2025-12-10 14:24:10.346	2025-12-10 14:24:10.346	2025-12-15 14:24:10.277
baa57e5f-303b-4e71-84f7-cdc392180a7e	cobblemonCelebration	841246467536584704	Added by ariuaniris.	1	2025-12-10 14:24:10.347	2025-12-10 14:24:10.347	2025-12-15 14:24:10.277
2b519729-4202-4fb5-b2e9-ef7bbc2c9d17	cobblemonCelebration	841246467536584704	Added by ariuaniris.	1	2025-12-10 14:24:10.348	2025-12-10 14:24:10.348	2025-12-15 14:24:10.277
282c4cfa-920b-41f1-bf22-e9c4dcff5663	cobblemonCelebration	841246467536584704	Added by ariuaniris.	1	2025-12-10 14:24:10.349	2025-12-10 14:24:10.349	2025-12-15 14:24:10.277
b3769ed4-90a6-4260-ab8f-cc7be3319260	cobblemonCelebration	825752488388329514	Added by ariuaniris.	1	2025-12-10 14:24:10.35	2025-12-10 14:24:10.35	2025-12-15 14:24:10.277
180933ae-018f-40ca-92a0-5a6158889c5a	cobblemonCelebration	825752488388329514	Added by ariuaniris.	1	2025-12-10 14:24:10.35	2025-12-10 14:24:10.35	2025-12-15 14:24:10.277
4ad773f3-9a42-4284-a18b-25bb5ffaad75	cobblemonCelebration	825752488388329514	Added by ariuaniris.	1	2025-12-10 14:24:10.351	2025-12-10 14:24:10.351	2025-12-15 14:24:10.277
1815091d-9bee-43bd-aa53-5e089addde0e	cobblemonCelebration	825752488388329514	Added by ariuaniris.	1	2025-12-10 14:24:10.352	2025-12-10 14:24:10.352	2025-12-15 14:24:10.277
caddd769-0127-4846-bd6d-b1ad399c0dea	cobblemonCelebration	825752488388329514	Added by ariuaniris.	1	2025-12-10 14:24:10.354	2025-12-10 14:24:10.354	2025-12-15 14:24:10.277
05bd1d9f-d8b8-4521-bc96-43dd6812b331	cobblemonCelebration	645919565758464010	Added by ariuaniris.	1	2025-12-10 14:24:10.356	2025-12-10 14:24:10.356	2025-12-15 14:24:10.277
1c97ba39-ffe9-4557-b4c3-8ac1d0d48056	cobblemonCelebration	645919565758464010	Added by ariuaniris.	1	2025-12-10 14:24:10.357	2025-12-10 14:24:10.357	2025-12-15 14:24:10.277
21cb4b76-04cb-43d2-8a85-7ee6bb4be1a4	cobblemonCelebration	645919565758464010	Added by ariuaniris.	1	2025-12-10 14:24:10.358	2025-12-10 14:24:10.358	2025-12-15 14:24:10.277
d02a7ef0-7a07-4cd3-841b-4d3099e08b32	cobblemonCelebration	645919565758464010	Added by ariuaniris.	1	2025-12-10 14:24:10.359	2025-12-10 14:24:10.359	2025-12-15 14:24:10.277
91103a87-014d-4220-ba49-8e6b10879556	cobblemonCelebration	645919565758464010	Added by ariuaniris.	1	2025-12-10 14:24:10.36	2025-12-10 14:24:10.36	2025-12-15 14:24:10.277
4a06d4d2-e8ed-4077-a518-be8db29d4280	cobblemonCelebration	780972375394091009	Added by ariuaniris.	1	2025-12-10 14:24:10.361	2025-12-10 14:24:10.361	2025-12-15 14:24:10.277
7716e1d0-48fe-4041-983a-37e0282928e9	cobblemonCelebration	780972375394091009	Added by ariuaniris.	1	2025-12-10 14:24:10.362	2025-12-10 14:24:10.362	2025-12-15 14:24:10.277
abf83f03-bcd9-440a-9a2f-0e9a6bcd2a3c	cobblemonCelebration	780972375394091009	Added by ariuaniris.	1	2025-12-10 14:24:10.363	2025-12-10 14:24:10.363	2025-12-15 14:24:10.277
fb81fc8c-7c52-481f-87f9-bd5b87903243	cobblemonCelebration	780972375394091009	Added by ariuaniris.	1	2025-12-10 14:24:10.365	2025-12-10 14:24:10.365	2025-12-15 14:24:10.277
5d2f770c-c40b-4944-84fb-01976eb3fffe	cobblemonCelebration	634021280529645569	Added by ariuaniris.	1	2025-12-10 14:24:10.366	2025-12-10 14:24:10.366	2025-12-15 14:24:10.277
7fcad0cc-c6a6-4807-adb3-a8c4d3d153f6	cobblemonCelebration	634021280529645569	Added by ariuaniris.	1	2025-12-10 14:24:10.368	2025-12-10 14:24:10.368	2025-12-15 14:24:10.277
2c16b8d5-610e-4dd2-bb7e-3e167cc1555d	cobblemonCelebration	634021280529645569	Added by ariuaniris.	1	2025-12-10 14:24:10.37	2025-12-10 14:24:10.37	2025-12-15 14:24:10.277
5c0b1c0a-718e-4f2f-bd4f-a7c18ef2ff60	cobblemonCelebration	634021280529645569	Added by ariuaniris.	1	2025-12-10 14:24:10.371	2025-12-10 14:24:10.371	2025-12-15 14:24:10.277
1384e655-46d4-452a-9171-bfba2684d637	cobblemonCelebration	634021280529645569	Added by ariuaniris.	1	2025-12-10 14:24:10.372	2025-12-10 14:24:10.372	2025-12-15 14:24:10.277
1413c9f4-9f45-4e38-af87-56835be049d2	cobblemonCelebration	658305794038825030	Added by ariuaniris.	1	2025-12-10 14:24:10.373	2025-12-10 14:24:10.373	2025-12-15 14:24:10.277
c0f2aefa-fae4-4370-acff-8e6cc539d6c3	cobblemonCelebration	658305794038825030	Added by ariuaniris.	1	2025-12-10 14:24:10.374	2025-12-10 14:24:10.374	2025-12-15 14:24:10.277
47e35e50-44f6-47dd-beec-618ac864752d	cobblemonCelebration	658305794038825030	Added by ariuaniris.	1	2025-12-10 14:24:10.375	2025-12-10 14:24:10.375	2025-12-15 14:24:10.277
0c071aca-4502-45ca-b56c-ee7886baba83	cobblemonCelebration	658305794038825030	Added by ariuaniris.	1	2025-12-10 14:24:10.376	2025-12-10 14:24:10.376	2025-12-15 14:24:10.277
0d79b1ef-8c5c-4aaa-8b47-0c4d6c370edd	cobblemonCelebration	658305794038825030	Added by ariuaniris.	1	2025-12-10 14:24:10.376	2025-12-10 14:24:10.376	2025-12-15 14:24:10.277
c473cb46-9c3b-4ddb-80d9-bd2788ba8a49	cobblemonCelebration	713930443027644477	Added by ariuaniris.	1	2025-12-10 14:24:10.377	2025-12-10 14:24:10.377	2025-12-15 14:24:10.277
ad1408e6-9489-4c33-a71e-aecb01eb0810	cobblemonCelebration	713930443027644477	Added by ariuaniris.	1	2025-12-10 14:24:10.377	2025-12-10 14:24:10.377	2025-12-15 14:24:10.277
a2bf6d4e-f2b6-4f4e-b894-419954ed18a3	cobblemonCelebration	713930443027644477	Added by ariuaniris.	1	2025-12-10 14:24:10.378	2025-12-10 14:24:10.378	2025-12-15 14:24:10.277
b4e91b23-0272-4c9b-8efc-36f4a4e32a7c	cobblemonCelebration	713930443027644477	Added by ariuaniris.	1	2025-12-10 14:24:10.378	2025-12-10 14:24:10.378	2025-12-15 14:24:10.277
fc5f2980-8f1a-49b7-bb74-04dd5a0cfb38	cobblemonCelebration	713930443027644477	Added by ariuaniris.	1	2025-12-10 14:24:10.379	2025-12-10 14:24:10.379	2025-12-15 14:24:10.277
7b94b57e-f557-40b5-899a-4c3a0714f51a	cobblemonCelebration	709605543358234674	Added by ariuaniris.	5	2026-01-30 14:26:31.572	2026-01-30 14:26:31.572	2026-02-19 14:26:31.568
81312c4b-224f-42c4-9aa4-3d829fc555cc	cobblemonCelebration	678185861275189258	Added by ariuaniris.	5	2026-01-30 14:26:31.579	2026-01-30 14:26:31.579	2026-02-19 14:26:31.568
72fd01df-a205-41e6-82db-c767168653b0	cobblemonCelebration	1372227913923039312	Added by ariuaniris.	5	2026-01-30 14:26:31.582	2026-01-30 14:26:31.582	2026-02-19 14:26:31.568
44e4c6de-f024-4516-ace6-896fde1a5784	cobblemonCelebration	950063797358428260	Added by ariuaniris.	5	2026-01-30 14:26:31.584	2026-01-30 14:26:31.584	2026-02-19 14:26:31.568
b6effafb-3a91-40df-b6cc-1e97d65f55b1	cobblemonCelebration	844193954756689921	Added by ariuaniris.	5	2026-01-30 14:26:31.585	2026-01-30 14:26:31.585	2026-02-19 14:26:31.568
fafbe7e3-4a39-400e-884d-9bbaecab87eb	cobblemonCelebration	804333943775559680	Added by ariuaniris.	5	2026-01-30 14:26:31.586	2026-01-30 14:26:31.586	2026-02-19 14:26:31.568
332b70ef-b113-4227-bf73-c08e664ff948	cobblemonCelebration	841246467536584704	Added by ariuaniris.	5	2026-01-30 14:26:31.588	2026-01-30 14:26:31.588	2026-02-19 14:26:31.568
a49956ba-0304-4213-b7ef-768c3416eb50	cobblemonCelebration	825752488388329514	Added by ariuaniris.	5	2026-01-30 14:26:31.589	2026-01-30 14:26:31.589	2026-02-19 14:26:31.568
70153b3a-b464-41c6-928b-2efa61dfe4de	cobblemonCelebration	645919565758464010	Added by ariuaniris.	5	2026-01-30 14:26:31.59	2026-01-30 14:26:31.59	2026-02-19 14:26:31.568
8ec53680-dd85-4901-9c3f-67770d8a9f86	cobblemonCelebration	780972375394091009	Added by ariuaniris.	5	2026-01-30 14:26:31.593	2026-01-30 14:26:31.593	2026-02-19 14:26:31.568
966bdca8-c967-47d1-8fba-651cc03fe9b8	cobblemonCelebration	634021280529645569	Added by ariuaniris.	5	2026-01-30 14:26:31.593	2026-01-30 14:26:31.593	2026-02-19 14:26:31.568
f016c90d-eee1-4093-abf0-6a1c2bbbdc99	cobblemonCelebration	658305794038825030	Added by ariuaniris.	5	2026-01-30 14:26:31.594	2026-01-30 14:26:31.594	2026-02-19 14:26:31.568
de2bb548-a6fe-4883-8a36-1d4841e5b4a2	cobblemonCelebration	713930443027644477	Added by ariuaniris.	5	2026-01-30 14:26:31.595	2026-01-30 14:26:31.595	2026-02-19 14:26:31.568
c2bcf7df-ffb5-4087-bbde-f57029cd935e	holiday	658305794038825030	Added by ariuaniris.	\N	2026-02-17 15:24:38.811	2026-02-17 15:24:38.811	2026-02-17 17:24:38.8
3b7a3d8a-7e9a-4ae5-8682-0a22e4770aba	holiday	709605543358234674	Added by ariuaniris. to role Minecraft	\N	2026-02-17 15:37:51.863	2026-02-17 15:37:51.863	2026-02-21 15:37:51.855
466c640c-f847-488a-8be4-02a428462167	holiday	678185861275189258	Added by ariuaniris. to role Minecraft	\N	2026-02-17 15:37:51.876	2026-02-17 15:37:51.876	2026-02-21 15:37:51.855
3a2fe518-b41a-45cc-9668-80aa119736d2	holiday	844193954756689921	Added by ariuaniris. to role Minecraft	\N	2026-02-17 15:37:51.88	2026-02-17 15:37:51.88	2026-02-21 15:37:51.855
3aa957b3-5e64-4b12-9f08-13b68abc725f	holiday	645919565758464010	Added by ariuaniris. to role Minecraft	\N	2026-02-17 15:37:51.883	2026-02-17 15:37:51.883	2026-02-21 15:37:51.855
dd923670-77ba-475a-9b67-6a461107ff44	holiday	780972375394091009	Added by ariuaniris. to role Minecraft	\N	2026-02-17 15:37:51.886	2026-02-17 15:37:51.886	2026-02-21 15:37:51.855
1e549665-fd48-4377-af18-1e35e0faa41e	holiday	634021280529645569	Added by ariuaniris. to role Minecraft	\N	2026-02-17 15:37:51.891	2026-02-17 15:37:51.891	2026-02-21 15:37:51.855
3946580e-4a60-4557-82dc-62df0489ac98	holiday	658305794038825030	Added by ariuaniris. to role Minecraft	\N	2026-02-17 15:37:51.894	2026-02-17 15:37:51.894	2026-02-21 15:37:51.855
4c53033f-ab80-4ad2-bb2f-d569adab81cf	holidayExemption	658305794038825030	Added by ariuaniris.	\N	2026-02-17 16:02:43.326	2026-02-17 16:02:43.326	2026-02-17 17:03:43.32
0b44d997-9c85-4077-9354-e11bc614035d	holidayExemption	658305794038825030	Added by ariuaniris.	\N	2026-02-18 15:01:15.666	2026-02-18 15:01:15.666	2026-02-20 15:01:15.657
c16ef247-4487-4a9b-b027-61577ef9d5f1	holidayExemption	709605543358234674	Added by ariuaniris. to role Minecraft	5	2026-02-18 15:06:10.769	2026-02-18 15:06:10.769	2026-02-21 15:06:10.761
86367c3e-f6a3-431b-aa15-e0fe78de1aa1	holidayExemption	678185861275189258	Added by ariuaniris. to role Minecraft	5	2026-02-18 15:06:10.784	2026-02-18 15:06:10.784	2026-02-21 15:06:10.761
b7ed8c2e-bcfd-4943-8c44-c8ad38f8e895	holidayExemption	844193954756689921	Added by ariuaniris. to role Minecraft	5	2026-02-18 15:06:10.788	2026-02-18 15:06:10.788	2026-02-21 15:06:10.761
e9c8063b-16bf-41bd-ae74-0ffbfb9dcc52	holidayExemption	645919565758464010	Added by ariuaniris. to role Minecraft	5	2026-02-18 15:06:10.794	2026-02-18 15:06:10.794	2026-02-21 15:06:10.761
49a3ab18-1fdd-4d16-99fd-b772020d680c	holidayExemption	780972375394091009	Added by ariuaniris. to role Minecraft	5	2026-02-18 15:06:10.797	2026-02-18 15:06:10.797	2026-02-21 15:06:10.761
8724d537-3ab6-48a4-8c54-1d0ff065676f	holidayExemption	634021280529645569	Added by ariuaniris. to role Minecraft	5	2026-02-18 15:06:10.8	2026-02-18 15:06:10.8	2026-02-21 15:06:10.761
67b02055-f17f-4f7a-9c11-aba87477954f	holidayExemption	658305794038825030	Added by ariuaniris. to role Minecraft	5	2026-02-18 15:06:10.803	2026-02-18 15:06:10.803	2026-02-21 15:06:10.761
f0c04167-711d-4fa9-909d-f7668b9fe052	holiday	709605543358234674	Added by ariuaniris. to role Minecraft	5	2026-02-23 02:57:25.354	2026-02-23 02:57:25.354	2026-03-01 02:57:25.347
4f0b1ef3-4dd5-4cd5-93ad-98bf99ef9213	holiday	678185861275189258	Added by ariuaniris. to role Minecraft	5	2026-02-23 02:57:25.366	2026-02-23 02:57:25.366	2026-03-01 02:57:25.347
01c6513d-3a7f-4cb5-82e9-e8d23c51b878	holiday	844193954756689921	Added by ariuaniris. to role Minecraft	5	2026-02-23 02:57:25.369	2026-02-23 02:57:25.369	2026-03-01 02:57:25.347
1cb65ad0-8207-470d-be94-3ea7962d3bd6	holiday	645919565758464010	Added by ariuaniris. to role Minecraft	5	2026-02-23 02:57:25.371	2026-02-23 02:57:25.371	2026-03-01 02:57:25.347
f21e45c0-0d28-48a5-888c-ca9a7217d926	holiday	780972375394091009	Added by ariuaniris. to role Minecraft	5	2026-02-23 02:57:25.372	2026-02-23 02:57:25.372	2026-03-01 02:57:25.347
c5178f94-4e1e-457a-9a6e-94040bffb003	holiday	634021280529645569	Added by ariuaniris. to role Minecraft	5	2026-02-23 02:57:25.378	2026-02-23 02:57:25.378	2026-03-01 02:57:25.347
447fa27e-29a2-4bb9-aa02-e0fcdcc9bc89	holiday	658305794038825030	Added by ariuaniris. to role Minecraft	5	2026-02-23 02:57:25.381	2026-02-23 02:57:25.381	2026-03-01 02:57:25.347
6a73d549-5e8f-4c39-b845-3af70af722d1	holidayExemption	709605543358234674	Added by ariuaniris. to role Minecraft	2	2026-02-23 02:58:32.979	2026-02-23 02:58:32.979	2026-03-01 02:58:32.978
20e3a38e-98dc-40a9-a55f-677536c2c27a	holidayExemption	678185861275189258	Added by ariuaniris. to role Minecraft	2	2026-02-23 02:58:32.985	2026-02-23 02:58:32.985	2026-03-01 02:58:32.978
7d44e9cb-ea7b-4c5e-ab0b-af170b0b5c95	holidayExemption	844193954756689921	Added by ariuaniris. to role Minecraft	2	2026-02-23 02:58:32.99	2026-02-23 02:58:32.99	2026-03-01 02:58:32.978
b2fdd294-19b6-4a08-80d4-2db9fb373dda	holidayExemption	645919565758464010	Added by ariuaniris. to role Minecraft	2	2026-02-23 02:58:32.993	2026-02-23 02:58:32.993	2026-03-01 02:58:32.978
50a82309-f89b-4314-917f-dff943cd6b9d	holidayExemption	780972375394091009	Added by ariuaniris. to role Minecraft	2	2026-02-23 02:58:33	2026-02-23 02:58:33	2026-03-01 02:58:32.978
232f13c6-4bc4-4ea3-8ad8-7cc599adab6f	holidayExemption	634021280529645569	Added by ariuaniris. to role Minecraft	2	2026-02-23 02:58:33.002	2026-02-23 02:58:33.002	2026-03-01 02:58:32.978
cc6675ed-ae42-42d8-abb7-7ef3163b41ee	holidayExemption	658305794038825030	Added by ariuaniris. to role Minecraft	2	2026-02-23 02:58:33.005	2026-02-23 02:58:33.005	2026-03-01 02:58:32.978
4585d9e5-13a4-4315-9a74-e1a4d07869b7	backtoschool	709605543358234674	Added by ariuaniris. to role Minecraft	3	2026-02-23 13:35:27.773	2026-02-23 13:35:27.773	2026-02-25 13:35:27.766
900ec5b2-98a2-41b4-b3ec-19070a024928	backtoschool	678185861275189258	Added by ariuaniris. to role Minecraft	3	2026-02-23 13:35:27.785	2026-02-23 13:35:27.785	2026-02-25 13:35:27.766
de34b0c3-dd8f-484a-aefa-db936456ac69	backtoschool	844193954756689921	Added by ariuaniris. to role Minecraft	3	2026-02-23 13:35:27.789	2026-02-23 13:35:27.789	2026-02-25 13:35:27.766
0dd95fbf-dae0-4fe7-af76-773ecbb64f8d	backtoschool	645919565758464010	Added by ariuaniris. to role Minecraft	3	2026-02-23 13:35:27.792	2026-02-23 13:35:27.792	2026-02-25 13:35:27.766
d4447706-86b6-4f82-9a76-c227776bab97	backtoschool	780972375394091009	Added by ariuaniris. to role Minecraft	3	2026-02-23 13:35:27.795	2026-02-23 13:35:27.795	2026-02-25 13:35:27.766
3985ad55-2d5f-4fb5-b3d9-7c24c6870f0d	backtoschool	634021280529645569	Added by ariuaniris. to role Minecraft	3	2026-02-23 13:35:27.801	2026-02-23 13:35:27.801	2026-02-25 13:35:27.766
7a1788cb-69f2-4047-adfb-a7afde830df1	backtoschool	658305794038825030	Added by ariuaniris. to role Minecraft	3	2026-02-23 13:35:27.804	2026-02-23 13:35:27.804	2026-02-25 13:35:27.766
4e7fdea1-06eb-4c14-aaac-3e78e5bf263a	forceOpen	658305794038825030	Added by ariuaniris.	2	2026-02-23 13:37:05.385	2026-02-23 13:37:05.385	\N
e5574fc0-455b-4a0f-9a48-4a945687c5c6	forceOpen	678185861275189258	Added by ariuaniris.	1	2026-02-23 13:37:58.217	2026-02-23 13:37:58.217	\N
7b7a016d-3260-44d4-84e4-024d1e009e6e	cobblemonCelebration	678185861275189258	Added by ariuaniris.	1	2026-02-23 14:01:09.373	2026-02-23 14:01:09.373	\N
bc648567-8a06-4556-81ab-233d490bcffc	cobblemonCelebration	678185861275189258	Added by ariuaniris.	1	2026-02-23 14:01:09.387	2026-02-23 14:01:09.387	\N
9250ff7e-0914-42ce-8fce-57d7093cec44	cobblemonCelebration	678185861275189258	Added by ariuaniris.	1	2026-02-23 14:01:09.39	2026-02-23 14:01:09.39	\N
6b5a4c3a-3cef-483e-9def-6b544ddd864f	cobblemonCelebration	678185861275189258	Added by ariuaniris.	1	2026-02-23 14:01:09.393	2026-02-23 14:01:09.393	\N
3d67b50b-9b31-4aea-8c42-8e18e0787763	cobblemonCelebration	678185861275189258	Added by ariuaniris.	1	2026-02-23 14:01:09.399	2026-02-23 14:01:09.399	\N
e6a3b1aa-a6cb-4ea4-b515-fea0be51623d	dse	658305794038825030	Added by ariuaniris.	\N	2026-04-24 11:42:24.095	2026-04-24 11:42:24.095	2026-04-24 12:00:00
268cf8a4-594b-4c86-a036-f0d41adbaa05	dse	658305794038825030	Added by ariuaniris.	\N	2026-04-24 16:58:16.809	2026-04-24 16:58:16.809	\N
016396d6-8e66-4ca1-a31e-2f467e0094b6	holidayExemption	780972375394091009	Added by ariuaniris.	10	2026-05-08 11:26:44.525	2026-05-08 11:26:44.525	\N
401673ac-0c05-4fdf-813f-bd21be200b07	dse	780972375394091009	\N	3	2026-04-24 05:46:54.834	2026-04-25 09:34:39.978	2026-05-07 16:00:00
0d66f4e9-5655-479f-81ff-f6a99482e910	holidayExemption	780972375394091009	\N	0	2026-04-24 09:33:35.713	2026-04-25 09:49:19.406	2026-05-07 16:00:00
c01f32ab-4888-44d1-8b8b-3f4b95714515	holidayExemption	658305794038825030	Added by ariuaniris.	\N	2026-04-25 09:55:53.46	2026-04-25 09:55:53.46	\N
60782bf3-3510-4d8c-a137-1fa19c79ba8e	forceOpen	780972375394091009	Added by ariuaniris.	8	2026-04-26 11:36:22.825	2026-04-26 11:36:22.825	2026-04-30 16:00:00
38caffa0-a420-44ed-bf2e-51da96b7593f	witchFarmHelper	780972375394091009	Added by ariuaniris.	1	2026-04-26 14:46:49.475	2026-04-26 14:46:49.475	2026-05-09 16:00:00
e8b6b7aa-fa52-434a-a984-977d091fcc1c	witchFarmHelper	780972375394091009	Added by ariuaniris.	1	2026-04-26 14:46:49.483	2026-04-26 14:46:49.483	2026-05-09 16:00:00
b309fc3c-6e81-4061-8271-bc8c81a210f2	witchFarmHelper	780972375394091009	Added by ariuaniris.	1	2026-04-26 14:46:49.486	2026-04-26 14:46:49.486	2026-05-09 16:00:00
4df7dbaf-55ca-42e7-994c-a94fc22f30f1	witchFarmHelper	780972375394091009	Added by ariuaniris.	1	2026-04-26 14:46:49.49	2026-04-26 14:46:49.49	2026-05-09 16:00:00
0e148b66-5060-4a3e-b1dc-164991edaad0	witchFarmHelper	780972375394091009	Added by ariuaniris.	1	2026-04-26 14:46:49.5	2026-04-26 14:46:49.5	2026-05-09 16:00:00
8d99e238-6682-4fa6-bdc6-ca525ba16404	dse	780972375394091009	\N	10	2026-05-01 15:50:53.844	2026-05-01 15:58:11.798	\N
359b7e33-a75b-40ea-8c74-be5497d56d24	dse	844193954756689921	Added by ariuaniris.	5	2026-05-03 18:15:49.067	2026-05-03 18:15:49.067	2026-05-09 16:00:00
1f27deee-1f19-42cb-8cad-d9dda1418e9b	holidayExemption	844193954756689921	Added by ariuaniris.	3	2026-05-06 12:11:21.665	2026-05-06 12:11:21.665	\N
\.


--
-- Data for Name: _TicketHistoryToTransaction; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."_TicketHistoryToTransaction" ("A", "B") FROM stdin;
\.


--
-- Data for Name: _TransactionToUserTicket; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public."_TransactionToUserTicket" ("A", "B") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: alvinho
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
d1d4dcb1-ce97-4e1b-ae68-eb43cf4ffc0e	b9552473778a3b334f93a7b4fa5e316712aec21731d7d14458792d7a98761ca2	2025-09-23 19:25:44.71881+08	20250923112544_init	\N	\N	2025-09-23 19:25:44.709361+08	1
46e60d7e-03e1-459f-93b0-80933a41e884	181a5209658a525fbd24d128ba5e6ab6327f5e3d87178a1468c01bc0ead9dbb7	2025-09-23 19:57:45.224499+08	20250923115745_init_2	\N	\N	2025-09-23 19:57:45.222731+08	1
8c14b5cc-61fc-48ea-a31a-0fc2ef60fd3b	efbaf02f2e89f6c3a07989d20987f333d17c770a9289795b82c0946bb2d4d2f9	2025-11-24 20:46:41.207074+08	20251124124641_server_mig	\N	\N	2025-11-24 20:46:41.194422+08	1
84c45d11-3173-4f93-972d-740f55585806	aafa03e9394dcc61a9403f92fe09444998ec96c3e9772bb8fb389765431d490a	2025-11-24 20:52:12.438514+08	20251124125212_server_2	\N	\N	2025-11-24 20:52:12.433169+08	1
3161d1d7-b765-4cf5-b0b9-940203e741fd	c40df7943e60b83c9244903ae150c8c5d9a2f629d45c58f6c45b38478e8bf952	2025-11-24 21:32:14.93499+08	20251124133214_server_mig_3	\N	\N	2025-11-24 21:32:14.932593+08	1
30df7a99-6700-4856-a1c7-fb82b3bc81db	a1bb7545fc46ffdb356227a71e9fd8d92a33d1cb28babc3e09d7e07f71aef972	2025-11-24 21:34:45.36117+08	20251124133445_server_mig_4	\N	\N	2025-11-24 21:34:45.358231+08	1
f42b5848-4ec9-4b58-8754-468e6e961cd9	bd9f8fe1150f078151c3b08567105bca4a2b6a8ea37898c092965ad767a6ec0a	2025-11-24 21:40:24.52243+08	20251124134024_server_mig_5	\N	\N	2025-11-24 21:40:24.520205+08	1
a30e0543-2a34-44bc-9d5f-3faaeeb17a68	a7f9a186cd717145d56556c4011b60100b0d5f38abfe6443493f4b4f2c8a040c	2025-11-24 22:13:24.988383+08	20251124141324_server_mig_6	\N	\N	2025-11-24 22:13:24.9861+08	1
40d8b178-8439-4bda-9cb6-f6a892d5ec2a	d5a2597dd71274a8841cfc9da86d7c6de561e866ba23ea135eb9dc8b34271a13	2025-11-25 18:34:53.344603+08	0_init		\N	2025-11-25 18:34:53.344603+08	0
85014f45-73ee-4cf1-be8d-1a049e8cc056	e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855	2025-12-09 19:14:46.622865+08	add-comments-and-post	\N	\N	2025-12-09 19:14:46.62032+08	1
\.


--
-- Name: Plugin_id_seq; Type: SEQUENCE SET; Schema: public; Owner: alvinho
--

SELECT pg_catalog.setval('public."Plugin_id_seq"', 1476, true);


--
-- Name: Server_id_seq; Type: SEQUENCE SET; Schema: public; Owner: alvinho
--

SELECT pg_catalog.setval('public."Server_id_seq"', 9, true);


--
-- Name: Permission Permission_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Permission"
    ADD CONSTRAINT "Permission_pkey" PRIMARY KEY ("userId");


--
-- Name: Player Player_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Player"
    ADD CONSTRAINT "Player_pkey" PRIMARY KEY (uuid);


--
-- Name: Plugin Plugin_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Plugin"
    ADD CONSTRAINT "Plugin_pkey" PRIMARY KEY ("projectId", "versionId", "serverId");


--
-- Name: ServerAccess ServerAccess_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."ServerAccess"
    ADD CONSTRAINT "ServerAccess_pkey" PRIMARY KEY ("userId", "serverId");


--
-- Name: Server Server_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Server"
    ADD CONSTRAINT "Server_pkey" PRIMARY KEY (id);


--
-- Name: Setting Setting_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Setting"
    ADD CONSTRAINT "Setting_pkey" PRIMARY KEY ("serverId", name, type);


--
-- Name: TicketHistory TicketHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."TicketHistory"
    ADD CONSTRAINT "TicketHistory_pkey" PRIMARY KEY (id);


--
-- Name: Ticket Ticket_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_pkey" PRIMARY KEY (id);


--
-- Name: Transaction Transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_pkey" PRIMARY KEY (id);


--
-- Name: UserTicket UserTicket_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."UserTicket"
    ADD CONSTRAINT "UserTicket_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _TicketHistoryToTransaction _TicketHistoryToTransaction_AB_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."_TicketHistoryToTransaction"
    ADD CONSTRAINT "_TicketHistoryToTransaction_AB_pkey" PRIMARY KEY ("A", "B");


--
-- Name: _TransactionToUserTicket _TransactionToUserTicket_AB_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."_TransactionToUserTicket"
    ADD CONSTRAINT "_TransactionToUserTicket_AB_pkey" PRIMARY KEY ("A", "B");


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Permission_userId_idx; Type: INDEX; Schema: public; Owner: alvinho
--

CREATE INDEX "Permission_userId_idx" ON public."Permission" USING btree ("userId");


--
-- Name: Plugin_id_key; Type: INDEX; Schema: public; Owner: alvinho
--

CREATE UNIQUE INDEX "Plugin_id_key" ON public."Plugin" USING btree (id);


--
-- Name: ServerAccess_userId_idx; Type: INDEX; Schema: public; Owner: alvinho
--

CREATE INDEX "ServerAccess_userId_idx" ON public."ServerAccess" USING btree ("userId");


--
-- Name: Server_path_key; Type: INDEX; Schema: public; Owner: alvinho
--

CREATE UNIQUE INDEX "Server_path_key" ON public."Server" USING btree (path);


--
-- Name: Server_pluginPath_key; Type: INDEX; Schema: public; Owner: alvinho
--

CREATE UNIQUE INDEX "Server_pluginPath_key" ON public."Server" USING btree ("pluginPath");


--
-- Name: TicketHistory_ticketId_idx; Type: INDEX; Schema: public; Owner: alvinho
--

CREATE INDEX "TicketHistory_ticketId_idx" ON public."TicketHistory" USING btree ("ticketId");


--
-- Name: Transaction_userId_idx; Type: INDEX; Schema: public; Owner: alvinho
--

CREATE INDEX "Transaction_userId_idx" ON public."Transaction" USING btree ("userId");


--
-- Name: UserTicket_userId_idx; Type: INDEX; Schema: public; Owner: alvinho
--

CREATE INDEX "UserTicket_userId_idx" ON public."UserTicket" USING btree ("userId");


--
-- Name: _TicketHistoryToTransaction_B_index; Type: INDEX; Schema: public; Owner: alvinho
--

CREATE INDEX "_TicketHistoryToTransaction_B_index" ON public."_TicketHistoryToTransaction" USING btree ("B");


--
-- Name: _TransactionToUserTicket_B_index; Type: INDEX; Schema: public; Owner: alvinho
--

CREATE INDEX "_TransactionToUserTicket_B_index" ON public."_TransactionToUserTicket" USING btree ("B");


--
-- Name: Permission Permission_serverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Permission"
    ADD CONSTRAINT "Permission_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES public."Server"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Permission Permission_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Permission"
    ADD CONSTRAINT "Permission_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Plugin Plugin_serverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Plugin"
    ADD CONSTRAINT "Plugin_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES public."Server"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ServerAccess ServerAccess_serverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."ServerAccess"
    ADD CONSTRAINT "ServerAccess_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES public."Server"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ServerAccess ServerAccess_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."ServerAccess"
    ADD CONSTRAINT "ServerAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Setting Setting_serverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Setting"
    ADD CONSTRAINT "Setting_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES public."Server"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TicketHistory TicketHistory_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."TicketHistory"
    ADD CONSTRAINT "TicketHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."UserTicket"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Transaction Transaction_serverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES public."Server"(id) ON UPDATE SET NULL ON DELETE SET NULL;


--
-- Name: Transaction Transaction_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserTicket UserTicket_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."UserTicket"
    ADD CONSTRAINT "UserTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Ticket"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserTicket UserTicket_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."UserTicket"
    ADD CONSTRAINT "UserTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _TicketHistoryToTransaction _TicketHistoryToTransaction_A_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."_TicketHistoryToTransaction"
    ADD CONSTRAINT "_TicketHistoryToTransaction_A_fkey" FOREIGN KEY ("A") REFERENCES public."TicketHistory"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _TicketHistoryToTransaction _TicketHistoryToTransaction_B_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."_TicketHistoryToTransaction"
    ADD CONSTRAINT "_TicketHistoryToTransaction_B_fkey" FOREIGN KEY ("B") REFERENCES public."Transaction"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _TransactionToUserTicket _TransactionToUserTicket_A_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."_TransactionToUserTicket"
    ADD CONSTRAINT "_TransactionToUserTicket_A_fkey" FOREIGN KEY ("A") REFERENCES public."Transaction"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _TransactionToUserTicket _TransactionToUserTicket_B_fkey; Type: FK CONSTRAINT; Schema: public; Owner: alvinho
--

ALTER TABLE ONLY public."_TransactionToUserTicket"
    ADD CONSTRAINT "_TransactionToUserTicket_B_fkey" FOREIGN KEY ("B") REFERENCES public."UserTicket"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Mh5yaoZ4puMegPB4BasaMGSAoTa8YU75jgglOWG0KOCcn32JXQprxQMsDB8nUdf

