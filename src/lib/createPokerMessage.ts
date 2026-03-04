import { IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import {
    IUIKitViewSubmitIncomingInteraction,
} from '@rocket.chat/apps-engine/definition/uikit/UIKitIncomingInteractionTypes';

import { IModalContext, IPokerStory } from '../definition';
import { createPokerBlocks } from './createPokerBlocks';
import { getVotingOptions } from './getVotingOptions';

interface IPokerStoryState {
    storyTitle: {
        title: string;
    };
    storyId?: {
        id: string;
    };
    storyLink?: {
        link: string;
    };
    storyDescription?: {
        description: string;
    };
    storyConfig?: {
        visibility: string;
    };
}

export async function createPokerMessage(data: IUIKitViewSubmitIncomingInteraction, read: IRead, modify: IModify, persistence: IPersistence, uid: string) {
    const { view: { id } } = data;
    const { state } = data.view as { state?: IPokerStoryState };

    const association = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, id);
    const [record] = await read.getPersistenceReader().readByAssociation(association) as Array<IModalContext>;

    if (!record.room) {
        throw new Error('Invalid room');
    }

    const title = state!.storyTitle.title;
    const storyId = state?.storyId?.id || '';
    const link = state?.storyLink?.link || '';
    const description = state?.storyDescription?.description || '';
    const visibility = state?.storyConfig?.visibility || 'closed';

    try {
        const showNames = await read.getEnvironmentReader().getSettings().getById('use-user-name');
        const votingOptions = await getVotingOptions(read);
        
        // Get the room to find the owner
        const room = await read.getRoomReader().getById(record.room.id);
        if (!room) {
            throw new Error('Room not found');
        }

        // Get app bot user
        const appUser = await read.getUserReader().getAppUser();
        if (!appUser) {
            throw new Error('App user not found');
        }

        const builder = modify.getCreator().startMessage()
            .setSender(appUser)
            .setRoom(record.room);

        // if story created from inside a thread, need to set the thread id
        if (record.threadId) {
            builder.setThreadId(record.threadId);
        }

        const story: IPokerStory = {
            title,
            storyId,
            link,
            description,
            uid,
            roomOwnerId: room.creator.id,
            msgId: '',
            totalVotes: 0,
            votes: votingOptions.map(() => ({ quantity: 0, voters: [] })),
            closed: true, // Stories start with voting closed
            showResults: visibility === 'open', // Show results in real-time for open voting
        };

        const block = modify.getCreator().getBlockBuilder();
        createPokerBlocks(block, story, showNames.value, votingOptions);

        builder.setBlocks(block);

        const messageId = await modify.getCreator().finish(builder);
        story.msgId = messageId;

        const storyAssociation = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, messageId);

        await persistence.createWithAssociation(story, storyAssociation);
    } catch (e) {
        throw e;
    }
}
