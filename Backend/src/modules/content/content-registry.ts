import type {Router} from "express";
import contentRoutes from "./content.routes.js";
import libraryRoutes from "../library/library.routes.js";

type ContentType = "none" | "shortDrama" | "quiz" | "novel" | "music";
type ContentRoute = {path: string; router: Router};

const routesByContentType: Partial<Record<ContentType, ContentRoute[]>> = {
  shortDrama: [
    {path: "/api/v1/content", router: contentRoutes},
    {path: "/api/v1/library", router: libraryRoutes},
  ],
};

/** 内容插件的服务端注册点。未注册的内容类型不会暴露任何内容 API。 */
export function getContentRoutes(contentType: ContentType): ContentRoute[] {
  return routesByContentType[contentType] ?? [];
}
