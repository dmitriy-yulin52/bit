import { Component, ComponentID } from '@teambit/component';
import gql from 'graphql-tag';
import { Scope } from '@teambit/legacy/dist/scope';
import { ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import isBinaryPath from 'is-binary-path';
import { BuilderMain } from './builder.main.runtime';
import { PipelineReport } from './build-pipeline-result-list';

export type ArtifactGQLFile = {
  id: string;
  name: string;
  path: string;
  content?: string;
  downloadUrl?: string;
};
export type ArtifactGQLData = ArtifactObject & { files: ArtifactGQLFile[]; componentId: ComponentID };
export type TaskReport = PipelineReport & {
  artifact: ArtifactGQLData;
  componentId: ComponentID;
};
export const FILE_PATH_PARAM_DELIM = '~';

export function builderSchema(builder: BuilderMain, scope: Scope) {
  return {
    typeDefs: gql`
      type TaskReport {
        id: String!
        name: String!
        description: String
        startTime: String
        endTime: String
        errors: [String!]
        warnings: [String!]
        artifact(path: String): Artifact
      }

      type ArtifactFile {
        # for GQL caching - same as the path
        id: String!
        name: String
        path: String!
        # artifact file content (only for text files). Use /api/<component-id>/~aspect/builder/<extension-id>/~<path> to fetch binary file data
        content: String
        downloadUrl: String
      }

      type Artifact {
        # artifact name
        name: String
        description: String
        files: [ArtifactFile!]!
      }

      type AspectData {
        # aspectId
        id: String!
        data: JSONObject
      }

      extend type Component {
        pipelineReport(taskId: String): [TaskReport!]!
      }
    `,

    resolvers: {
      Component: {
        pipelineReport: async (component: Component, { taskId }: { taskId?: string }) => {
          const builderData = builder.getBuilderData(component);

          const artifactsByTask = builderData?.artifacts
            ?.filter((artifact) => !taskId || artifact.task.id === taskId)
            .reduce((accum, next) => {
              accum.set(next.task.id, next);
              return accum;
            }, new Map<string, ArtifactObject>());

          const pipelineReport = builderData?.pipeline
            .filter((pipeline) => !taskId || pipeline.taskId === taskId)
            .map((pipeline) => ({
              ...pipeline,
              artifact: artifactsByTask?.get(pipeline.taskId),
              componentId: component.id,
            }));

          return pipelineReport;
        },
      },
      TaskReport: {
        id: (taskReport: TaskReport) => taskReport.taskId,
        name: (taskReport: TaskReport) => taskReport.taskName,
        description: (taskReport: TaskReport) => taskReport.taskDescription,
        startTime: (taskReport: TaskReport) => taskReport.startTime,
        endTime: (taskReport: TaskReport) => taskReport.endTime,
        errors: (taskReport: TaskReport) => taskReport.errors?.map((e) => e.toString()),
        warnings: (taskReport: TaskReport) => taskReport.warnings,
        artifact: async (taskReport: TaskReport, { path: pathFilter }: { path?: string }) => {
          if (!taskReport.artifact) return undefined;

          const files = (
            await taskReport.artifact.files.getVinylsAndImportIfMissing(taskReport.componentId._legacy, scope)
          )
            .filter((vinyl) => !pathFilter || vinyl.path === pathFilter)
            .map(async (vinyl) => {
              const { basename, path, contents } = vinyl;
              const isBinary = isBinaryPath(path);
              const content = !isBinary ? contents.toString('utf-8') : undefined;
              const downloadUrl = encodeURI(
                `/api/${taskReport.componentId}/~aspect/builder/${taskReport.taskId}/${FILE_PATH_PARAM_DELIM}${path}`
              );
              return { id: path, name: basename, path, content, downloadUrl };
            });

          return {
            ...taskReport.artifact,
            id: taskReport.artifact.task.id,
            taskName: taskReport.artifact.task.name,
            taskId: taskReport.artifact.task.id,
            files,
            componentId: taskReport.componentId,
          };
        },
      },
    },
  };
}
