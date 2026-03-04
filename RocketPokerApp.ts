import {
    IConfigurationExtend,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';
import {
    IUIKitInteractionHandler,
    UIKitBlockInteractionContext,
    UIKitViewSubmitInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { RocketPokerStoryCommand } from './src/RocketPokerStoryCommand';
import { RocketPokerSessionCommand } from './src/RocketPokerSessionCommand';
import { RocketPokerHelpCommand } from './src/RocketPokerHelpCommand';
import { createPokerStoryModal } from './src/lib/createPokerStoryModal';
import { createPokerMessage } from './src/lib/createPokerMessage';
import { votePoker } from './src/lib/votePoker';
import { openPokerVoting } from './src/lib/openPokerVoting';
import { closePokerVoting } from './src/lib/closePokerVoting';

export class RocketPokerApp extends App implements IUIKitInteractionHandler {
    private readonly appLogger: ILogger

    constructor(info: IAppInfo, logger: ILogger) {
        super(info, logger);
        this.appLogger = this.getLogger()
    }

    public async executeViewSubmitHandler(context: UIKitViewSubmitInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify) {
        const data = context.getInteractionData();

        const { state } = data.view as any;
        
        // Validate title field before processing
        if (!state?.storyTitle?.title || state.storyTitle.title.trim() === '') {
            return context.getInteractionResponder().viewErrorResponse({
                viewId: data.view.id,
                errors: {
                    title: 'Please provide a story title',
                },
            });
        }

        try {
            // Get the modal context data
            const association = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, data.view.id);
            const [record] = await read.getPersistenceReader().readByAssociation(association) as Array<any>;

            // Check if this is an edit operation
            if (record?.msgId) {
                // This is an edit - update existing story
                const { updatePokerStory } = await import('./src/lib/updatePokerStory');
                
                await updatePokerStory(
                    record.msgId,
                    {
                        title: state.storyTitle.title,
                        storyId: state?.storyId?.id || '',
                        link: state?.storyLink?.link || '',
                        description: state?.storyDescription?.description || '',
                    },
                    read,
                    modify,
                    persistence
                );
            } else {
                // This is a new story - create it
                await createPokerMessage(data, read, modify, persistence, data.user.id);
            }
        } catch (err) {
            return context.getInteractionResponder().viewErrorResponse({
                viewId: data.view.id,
                errors: err,
            });
        }

        return {
            success: true,
        };
    }

    public async executeBlockActionHandler(context: UIKitBlockInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify) {
        const data = context.getInteractionData();

        const { actionId } = data;


       this.appLogger.log(actionId);

        switch (actionId) {
            case 'votePoker': {
                await votePoker({ data, read, persistence, modify });

                return {
                    success: true,
                };
            }

            case 'finishVoting': {
                await closePokerVoting({ data, read, persistence, modify });

                return {
                    success: true,
                };
            }

            case 'storyActions': {
                // Handle the unified story actions menu
                const action = data.value;
                if (!action) {
                    return { success: false };
                }

                if (action === 'start' || action === 'reopen') {
                    await openPokerVoting({ data, read, persistence, modify });
                    return { success: true };
                } else if (action === 'finish') {
                    await closePokerVoting({ data, read, persistence, modify });
                    return { success: true };
                } else if (action === 'edit') {
                    // Open edit modal with existing story data
                    const { getPokerStory } = await import('./src/lib/getPokerStory');
                    const story = await getPokerStory(String(data.message!.id), read);
                    
                    if (!story) {
                        throw new Error('Story not found');
                    }

                    // Check if the user is the room owner
                    if (data.user.id !== story.roomOwnerId) {
                        const appUser = await read.getUserReader().getAppUser();
                        if (appUser) {
                            const notifier = modify.getNotifier();
                            const message = modify.getCreator().startMessage()
                                .setSender(appUser)
                                .setRoom(data.room!)
                                .setText('❌ Only the session owner can edit the story.');
                            
                            await notifier.notifyUser(data.user, message.getMessage());
                        }
                        return { success: true };
                    }

                    const modal = await createPokerStoryModal({ 
                        persistence, 
                        modify,
                        data: {
                            room: data.room,
                            threadId: data.message?.threadId,
                        },
                        existingStory: story,
                        isEdit: true,
                    });

                    return context.getInteractionResponder().openModalViewResponse(modal);
                }

                return { success: true };
            }

            case 'create': {
                const modal = await createPokerStoryModal({ data, persistence, modify });

                return context.getInteractionResponder().openModalViewResponse(modal);
            }
        }

        return {
            success: true,
            triggerId: data.triggerId,
        };
    }

    public async initialize(configuration: IConfigurationExtend): Promise<void> {
        await configuration.slashCommands.provideSlashCommand(new RocketPokerStoryCommand());
        await configuration.slashCommands.provideSlashCommand(new RocketPokerSessionCommand());
        await configuration.slashCommands.provideSlashCommand(new RocketPokerHelpCommand());
        await configuration.settings.provideSetting({
            id : 'use-user-name',
            i18nLabel: 'setting_use_names_label',
            i18nDescription: 'setting_use_names_description',
            required: false,
            type: SettingType.BOOLEAN,
            public: true,
            packageValue: false,
        });
        await configuration.settings.provideSetting({
            id: 'voting-options',
            i18nLabel: 'setting_voting_options_label',
            i18nDescription: 'setting_voting_options_description',
            required: true,
            type: SettingType.STRING,
            public: true,
            packageValue: '1,2,3,5,8,13,☕ Coffee',
        });
    }
}