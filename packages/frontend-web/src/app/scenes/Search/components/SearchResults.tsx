/*
Copyright 2017 Google Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { autobind } from 'core-decorators';
import FocusTrap from 'focus-trap-react';
import { List, Set } from 'immutable';
import keyboardJS from 'keyboardjs';
import React from 'react';
import { RouteComponentProps } from 'react-router';

import {
  CircularProgress,
} from '@material-ui/core';

import {
  ITagModel,
  ModelId,
  TagModel,
} from '../../../../models';
import { ICommentAction } from '../../../../types';
import {
  AddIcon,
  ApproveIcon,
  CommentActionButton,
  DeferIcon,
  HighlightIcon,
  LazyCommentList,
  RejectIcon,
  Scrim,
  ToastMessage,
  ToolTip,
} from '../../../components';
import {
  approveComments,
  deferComments,
  highlightComments,
  ICommentActionFunction,
  rejectComments,
  resetComments,
  tagCommentSummaryScores,
} from '../../../stores/commentActions';
import {
  DARK_COLOR,
  GUTTER_DEFAULT_SPACING,
  HEADER_HEIGHT,
  LIGHT_PRIMARY_TEXT_COLOR,
  MEDIUM_COLOR,
  NICE_MIDDLE_BLUE,
  SCRIM_STYLE,
  SCRIM_Z_INDEX,
  TOOLTIP_Z_INDEX,
  WHITE_COLOR,
} from '../../../styles';
import { partial } from '../../../util';
import { css, stylesheet } from '../../../utilx';
import { commentSearchDetailsPageLink, ISearchQueryParams } from '../../routes';

const TOAST_DELAY = 6000;

let showActionIcon: JSX.Element = null;
const ACTION_PLURAL: any = {
  highlight: 'highlighted',
  approve: 'approved',
  defer: 'deferred',
  reject: 'rejected',
  tag: 'tagged',
};

const sortDefinitions: any = {
  relevance: {
    sortInfo: '',
  },
  newest: {
    sortInfo: '-sourceCreatedAt',
  },
  oldest: {
    sortInfo: 'sourceCreatedAt',
  },
};
const sortOptions = List.of(
  TagModel({
    key: 'relevance',
    label: 'Relevance',
    color: '',
  }),
  TagModel({
    key: 'newest',
    label: 'Newest',
    color: '',
  }),
  TagModel({
    key: 'oldest',
    label: 'Oldest',
    color: '',
  }),
);

const RESULTS_HEADER_HEIGHT = 50;

const STYLES = stylesheet({
  children: {
    display: 'inline-block',
  },
  placeholderBgContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: window.innerHeight - HEADER_HEIGHT - RESULTS_HEADER_HEIGHT,
    width: '100%',
  },
  resultsHeader: {
    alignItems: 'center',
    backgroundColor: NICE_MIDDLE_BLUE,
    color: LIGHT_PRIMARY_TEXT_COLOR,
    display: 'flex',
    flexWrap: 'no-wrap',
    justifyContent: 'space-between',
    height: RESULTS_HEADER_HEIGHT,
  },
  resultsHeadline: {
    marginLeft: 29,
  },
  resultsActionHeadline: {
    color: WHITE_COLOR,
  },
  moderateButtons: {
    display: 'flex',
  },
  commentActionButton: {
    marginRight: `${GUTTER_DEFAULT_SPACING}px`,
  },
  dropdown: {
    position: 'relative',
  },
  scrim: {
    zIndex: SCRIM_Z_INDEX,
    background: 'none',
  },
  actionToastCount: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
    lineHeight: 1.5,
    textIndent: 4,
  },
  toolTipWithTags: {
    container: {
      width: 250,
      marginRight: GUTTER_DEFAULT_SPACING,
    },

    ul: {
      listStyle: 'none',
      margin: 0,
      padding: `${GUTTER_DEFAULT_SPACING}px 0`,
    },

    button: {
      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: 0,
      color: MEDIUM_COLOR,
      cursor: 'pointer',
      padding: '8px 20px',
      textAlign: 'left',
      width: '100%',

      ':hover': {
        backgroundColor: MEDIUM_COLOR,
        color: LIGHT_PRIMARY_TEXT_COLOR,
      },

      ':focus': {
        backgroundColor: MEDIUM_COLOR,
        color: LIGHT_PRIMARY_TEXT_COLOR,
      },
    },
  },
});

const actionMap: { [key: string]: ICommentActionFunction } = {
  highlight: highlightComments,
  approve: approveComments,
  defer: deferComments,
  reject: rejectComments,
  tag: tagCommentSummaryScores,
  reset: resetComments,
};

export interface ISearchResultsProps extends RouteComponentProps<{}> {
  isLoading: boolean;
  isItemChecked(id: string): boolean;
  areNoneSelected: boolean;
  areAllSelected: boolean;
  selectedCount: number;
  allCommentIds?: Array<string>;
  tags?: List<ITagModel>;
  textSizes?: Map<ModelId, number>;
  pagingIdentifier?: string;

  onToggleSelectAll?(): void;
  onToggleSingleItem(item: { id: string }): void;
  updateSearchQuery(queryDelta: ISearchQueryParams): void;

  searchTerm?: string;
  searchByAuthor?: boolean;
}

export interface ISearchResultsState {
  selectedCount?: number;
  commentSortType?: string;
  isTaggingToolTipMetaVisible?: boolean;
  taggingToolTipMetaPosition?: {
    top: number;
    left: number;
  };
  isConfirmationModalVisible?: boolean;
  confirmationAction?: ICommentAction;
  toastButtonLabel?: 'Undo' | 'Remove rule';
  toastIcon?: JSX.Element;
  showCount?: boolean;
  actionCount?: number;
  actionText?: string;
}

export class SearchResults extends React.Component<ISearchResultsProps, ISearchResultsState> {

  commentActionCancelled = false;

  state: ISearchResultsState = {
    isTaggingToolTipMetaVisible: false,
    commentSortType: this.props.searchByAuthor ? 'newest' : 'relevance',
    taggingToolTipMetaPosition: {
      top: 0,
      left: 0,
    },
    isConfirmationModalVisible: false,
    confirmationAction: null,
    actionText: '',
    toastButtonLabel: null,
    toastIcon: null,
    showCount: false,
    actionCount: 0,
  };

  componentDidMount() {
    keyboardJS.bind('escape', this.onPressEscape);
  }

  componentWillUnmount() {
    keyboardJS.unbind('escape', this.onPressEscape);
  }

  @autobind
  onPressEscape() {
    this.setState({
      isConfirmationModalVisible: false,
      isTaggingToolTipMetaVisible: false,
    });
  }

  /**
   * Tell the lazy list to re-query.
   */
  updateScope(sort: any) {
    let newSort = sortDefinitions[sort] && sortDefinitions[sort].sortInfo;
    if (!newSort) {
      newSort = null;
    }
    this.props.updateSearchQuery({sort: newSort});
  }

  @autobind
  onSortChange(event: React.FormEvent<any>) {
    const newSort = (event.target as any).value;
    this.updateScope(newSort);
    this.setState({commentSortType: newSort});
  }

  @autobind
  async onSelectAllChange() {
    await this.props.onToggleSelectAll();
  }

  @autobind
  async onSelectionChange(id: string) {
    await this.props.onToggleSingleItem({ id });
  }

  matchAction(action: ICommentAction) {
    if (action === 'approve') {
      showActionIcon = <ApproveIcon {...css({fill: DARK_COLOR})} />;
    } else if (action === 'reject') {
      showActionIcon = <RejectIcon {...css({fill: DARK_COLOR})} />;
    } else if (action === 'highlight') {
      showActionIcon = <HighlightIcon {...css({fill: DARK_COLOR})} />;
    } else if (action === 'defer') {
      showActionIcon = <DeferIcon {...css({fill: DARK_COLOR})} />;
    } else if (action === 'tag') {
      showActionIcon = <AddIcon {...css({fill: DARK_COLOR})} />;
    }

    return showActionIcon;
  }

  @autobind
  onConfirmationClose() {
    this.setState({isConfirmationModalVisible: false });
  }

  @autobind
  handleUndoClick() {
    this.commentActionCancelled = true;
    this.onConfirmationClose();
  }

  @autobind
  async dispatchConfirmedAction(action: ICommentAction, ids?: Array<string>) {
    const idsToDispatch = ids || this.getSelectedIDs();
    actionMap[action](idsToDispatch);
  }

  @autobind
  getSelectedIDs(): Array<string> {
    return this.props.allCommentIds.filter((id) => (
      this.props.isItemChecked(id)
    ));
  }

  @autobind
  calculateTaggingTriggerPosition(ref: HTMLElement) {
    if (!ref) {
      return;
    }

    const buttonRect = ref.getBoundingClientRect();

    this.setState({
      taggingToolTipMetaPosition: {
        top: buttonRect.height / 2,
        left: (buttonRect.width / 2) - 10,
      },
    });
  }

  @autobind
  toggleTaggingToolTip() {
    this.setState({
      isTaggingToolTipMetaVisible: !this.state.isTaggingToolTipMetaVisible,
    });
  }

  @autobind
  confirmationClose() {
    this.setState({ isConfirmationModalVisible: false });
  }

  @autobind
  onTagButtonClick(tagId: string) {
    const ids = this.getSelectedIDs();
    this.triggerActionToast('tag', ids.length, () => tagCommentSummaryScores(ids, tagId));
    this.toggleTaggingToolTip();
  }

  @autobind
  triggerActionToast(action: ICommentAction, count: number, callback: (action?: ICommentAction) => any) {
    this.setState({
      isConfirmationModalVisible: true,
      confirmationAction: action,
      actionCount: count,
      actionText: `Comment${count > 1 ? 's' : ''} ` + ACTION_PLURAL[action],
      toastButtonLabel: 'Undo',
      toastIcon: this.matchAction(action),
      showCount: true,
    });
    setTimeout(async () => {
      if (this.commentActionCancelled) {
        this.commentActionCancelled = false;
        this.confirmationClose();

        return false;
      } else {
        this.setState({
          toastButtonLabel: null,
        });
        await callback(action);
        this.confirmationClose();
      }
    }, TOAST_DELAY);
  }

  @autobind
  async handleAssignTagsSubmit(commentId: ModelId, selectedTagIds: Set<ModelId>) {
    selectedTagIds.forEach((tagId) => {
      tagCommentSummaryScores([commentId], tagId);
    });
    this.dispatchConfirmedAction('reject', [commentId]);
  }

  render() {
    const {
      textSizes,
      isItemChecked,
      areNoneSelected,
      areAllSelected,
      selectedCount,
      tags,
      allCommentIds,
      isLoading,
      pagingIdentifier,
      searchTerm,
    } = this.props;

    const {
      isTaggingToolTipMetaVisible,
      taggingToolTipMetaPosition,
      commentSortType,
      isConfirmationModalVisible,
      actionCount,
      actionText,
    } = this.state;

    function getLinkTarget(commentId: ModelId) {
      const query = pagingIdentifier && {pagingIdentifier};
      return commentSearchDetailsPageLink(commentId, query);
    }

    const totalCommentCount = allCommentIds?.length || 0;

    return (
      <div>
        {isLoading && (
          <div key="searchIcon" {...css(STYLES.placeholderBgContainer)}>
            <CircularProgress color="primary" size={100}/>
          </div>
        )}
        <div key="content" {...css({backgroundColor: 'white'}, {display: 'block'})} >
          <div {...css(STYLES.resultsHeader)}>
            {searchTerm && !isLoading && (
              <p {...css(STYLES.resultsHeadline, !areNoneSelected && STYLES.resultsActionHeadline)}>
                {selectedCount > 0 && `${selectedCount} / `}
                {totalCommentCount} result{totalCommentCount > 1 && 's'}
                {selectedCount > 0 || areAllSelected && ' selected'}
              </p>
            )}
            {isLoading && (
              <p {...css(STYLES.resultsHeadline, !areNoneSelected && STYLES.resultsActionHeadline)}>
                  Loading...
              </p>
            )}
            { !areNoneSelected && (
              <div {...css(STYLES.moderateButtons)}>
                <CommentActionButton
                  disabled={areNoneSelected}
                  style={STYLES.commentActionButton}
                  label="Approve"
                  onClick={partial(
                    this.triggerActionToast,
                    'approve',
                    this.getSelectedIDs().length,
                    this.dispatchConfirmedAction,
                  )}
                  icon={(
                    <ApproveIcon {...css({fill: LIGHT_PRIMARY_TEXT_COLOR})} />
                  )}
                />

                <CommentActionButton
                  disabled={areNoneSelected}
                  style={STYLES.commentActionButton}
                  label="Reject"
                  onClick={partial(
                    this.triggerActionToast,
                    'reject',
                    this.getSelectedIDs().length,
                    this.dispatchConfirmedAction,
                  )}
                  icon={(
                    <RejectIcon {...css({fill: LIGHT_PRIMARY_TEXT_COLOR})} />
                  )}
                />

                <CommentActionButton
                  disabled={areNoneSelected}
                  style={STYLES.commentActionButton}
                  label="Defer"
                  onClick={partial(
                    this.triggerActionToast,
                    'defer',
                    this.getSelectedIDs().length,
                    this.dispatchConfirmedAction,
                  )}
                  icon={(
                    <DeferIcon {...css({fill: LIGHT_PRIMARY_TEXT_COLOR})} />
                  )}
                />
                  <div {...css(STYLES.dropdown)}>
                    <CommentActionButton
                      disabled={areNoneSelected}
                      buttonRef={this.calculateTaggingTriggerPosition}
                      label="Tag"
                      onClick={this.toggleTaggingToolTip}
                      icon={(
                        <AddIcon {...css({fill: LIGHT_PRIMARY_TEXT_COLOR})} />
                      )}
                    />
                    {isTaggingToolTipMetaVisible && (
                      <ToolTip
                        arrowPosition="topRight"
                        backgroundColor={WHITE_COLOR}
                        hasDropShadow
                        isVisible={isTaggingToolTipMetaVisible}
                        onDeactivate={this.toggleTaggingToolTip}
                        position={taggingToolTipMetaPosition}
                        size={16}
                        width={250}
                        zIndex={TOOLTIP_Z_INDEX}
                      >
                        <div {...css(STYLES.toolTipWithTags.container)}>
                          <ul {...css(STYLES.toolTipWithTags.ul)}>
                            {tags && tags.map((t, i) => (
                              <li key={t.id}>
                                <button
                                  onClick={partial(this.onTagButtonClick, t.id)}
                                  key={`tag-${i}`}
                                  {...css(STYLES.toolTipWithTags.button)}
                                >
                                  {t.label}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </ToolTip>
                    )}
                  </div>
                </div>
            )}
          </div>
          {!isLoading && searchTerm && totalCommentCount > 0 &&  (
            <LazyCommentList
              heightOffset={HEADER_HEIGHT + RESULTS_HEADER_HEIGHT}
              textSizes={textSizes}
              commentIds={allCommentIds}
              areAllSelected={areAllSelected}
              currentSort={commentSortType}
              getLinkTarget={getLinkTarget}
              isItemChecked={isItemChecked}
              onSelectAllChange={this.onSelectAllChange}
              onSelectionChange={this.onSelectionChange}
              onSortChange={this.onSortChange}
              sortOptions={sortOptions}
              totalItems={totalCommentCount}
              searchTerm={searchTerm}
              displayArticleTitle
              dispatchConfirmedAction={this.dispatchConfirmedAction}
              handleAssignTagsSubmit={this.handleAssignTagsSubmit}
            />
          )}
        </div>

        <Scrim
          key="confirmationScrim"
          scrimStyles={{...STYLES.scrim, ...SCRIM_STYLE.scrim}}
          isVisible={isConfirmationModalVisible}
          onBackgroundClick={this.confirmationClose}
        >
          <FocusTrap
            focusTrapOptions={{
              clickOutsideDeactivates: true,
            }}
          >
            <ToastMessage
              icon={this.state.toastIcon}
              buttonLabel={this.state.toastButtonLabel}
              onClick={this.handleUndoClick}
            >
              <div key="toastContent">
                { this.state.showCount && (
                  <span key="toastCount" {...css(STYLES.actionToastCount)}>
                    {showActionIcon}
                    {actionCount}
                  </span>
                )}
                <p key="actionText">{actionText}</p>
              </div>
            </ToastMessage>
          </FocusTrap>
        </Scrim>
      </div>
    );
  }
}
