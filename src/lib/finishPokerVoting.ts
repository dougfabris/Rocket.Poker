import { IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { IUIKitBlockIncomingInteraction } from '@rocket.chat/apps-engine/definition/uikit/UIKitIncomingInteractionTypes';

import { createPokerBlocks } from './createPokerBlocks';
import { getPokerStory } from './getPokerStory';
import { getVotingOptions } from './getVotingOptions';

export async function finishPokerVoting({ data, read, persistence, modify }: {
    data: IUIKitBlockIncomingInteraction,
    read: IRead,
    persistence: IPersistence,
    modify: IModify,
}) {
    if (!data.message) {
        return {
            success: true,
        };
    }

    const story = await getPokerStory(String(data.message.id), read);
    if (!story) {
        throw new Error('Story not found');
    }

    if (story.finished) {
        throw new Error('Voting has already finished');
    }

    // Check if the user is the room owner
    if (data.user.id !== story.roomOwnerId) {
        const appUser = await read.getUserReader().getAppUser();
        if (!appUser) {
            throw new Error('App user not found');
        }
        
        const notifier = modify.getNotifier();
        const message = modify.getCreator().startMessage()
            .setSender(appUser)
            .setRoom(data.room!)
            .setText('❌ Only the session owner can finish voting.');
        
        await notifier.notifyUser(data.user, message.getMessage());
        
        return {
            success: true,
        };
    }

    story.finished = true;
    story.finishedAt = new Date();

    const association = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, story.msgId);
    await persistence.updateByAssociation(association, story);

    const message = await modify.getUpdater().message(data.message.id as string, data.user);
    message.setEditor(message.getSender());

    const block = modify.getCreator().getBlockBuilder();

    const showNames = await read.getEnvironmentReader().getSettings().getById('use-user-name');
    const votingOptions = await getVotingOptions(read);

    createPokerBlocks(block, story, showNames.value, votingOptions);

    message.setBlocks(block);

    return modify.getUpdater().finish(message);
}
