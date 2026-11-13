import projectData from "./projects.json";

export type ProjectImage = { id: string; src: string; width: number; height: number; alt: string };
export type Project = {
  id: string; number: string; color: string; ink: string; title: string; subtitle: string;
  images: ProjectImage[];
};

// Ordered image lists are the only source of detail content; no fixed page count.
export const projects: Project[] = projectData;
