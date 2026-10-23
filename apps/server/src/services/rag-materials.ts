import type { Attachment, Project } from '@defense/shared'
import { knowledgeFor, retrievalMaterials } from './knowledge-service.js'
import type { AttachmentService } from './attachment-service.js'

export async function prepareRagMaterials(attachments: AttachmentService, project: Project, query: string,
  extraAttachments: Attachment[] = [], signal?: AbortSignal, overview = false) {
  const retrieval = await knowledgeFor(attachments).search({project, extraAttachments}, query.slice(0,600), signal, overview)
  const images = (await attachments.materials([...extraAttachments, ...(project.attachments ?? [])], 0)).images
  return {images, documents: retrievalMaterials(retrieval),
    retrieval: retrieval.documents.length ? retrieval : undefined}
}
