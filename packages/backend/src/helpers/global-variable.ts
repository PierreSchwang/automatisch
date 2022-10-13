import createHttpClient from './http-client';
import Connection from '../models/connection';
import Flow from '../models/flow';
import Step from '../models/step';
import Execution from '../models/execution';
import {
  IJSONObject,
  IApp,
  IGlobalVariable,
  ITriggerDataItem,
} from '@automatisch/types';
import triggerQueue from '../queues/trigger';

type GlobalVariableOptions = {
  connection?: Connection;
  app: IApp;
  flow?: Flow;
  step?: Step;
  execution?: Execution;
};

const globalVariable = async (
  options: GlobalVariableOptions
): Promise<IGlobalVariable> => {
  const { connection, app, flow, step, execution } = options;

  const lastInternalId = await flow?.lastInternalId();

  const trigger = await step?.getTriggerCommand();
  const nextStep = await flow
    ?.$relatedQuery('steps')
    .where({ position: step.position + 1 })
    .first();

  const variable: IGlobalVariable = {
    auth: {
      set: async (args: IJSONObject) => {
        if (connection) {
          await connection.$query().patchAndFetch({
            formattedData: {
              ...connection.formattedData,
              ...args,
            },
          });
        }

        return null;
      },
      data: connection?.formattedData,
    },
    app: app,
    http: createHttpClient({ baseURL: app.baseUrl }),
    flow: {
      id: flow?.id,
      lastInternalId,
    },
    step: {
      id: step?.id,
      appKey: step?.appKey,
      parameters: step?.parameters || {},
    },
    nextStep: {
      id: nextStep?.id,
      appKey: nextStep?.appKey,
      parameters: nextStep?.parameters || {},
    },
    execution: {
      id: execution?.id,
    },
  };

  variable.process = async (triggerDataItem: ITriggerDataItem) => {
    const jobName = `${step.appKey}-${triggerDataItem.meta.internalId}`;
    const jobPayload = {
      $: variable,
      triggerDataItem,
    };

    await triggerQueue.add(jobName, jobPayload);
  };

  if (trigger && trigger.dedupeStrategy === 'unique') {
    const lastInternalIds = await flow?.lastInternalIds();

    const isAlreadyProcessed = (internalId: string) => {
      return lastInternalIds?.includes(internalId);
    };

    variable.flow.isAlreadyProcessed = isAlreadyProcessed;
  }

  return variable;
};

export default globalVariable;
