                    @p@No open projects@/p@
                  ) : (
                    openOrders.map(o => (
                      @div key=~L~o.id~R~ className=~S~panel~S~ style=~L~~L~ marginBottom: 12 ~R~~R~@
                        @div className=~S~panel-title~S~@
                          @div className=~S~accent-bar~S~ /@
                          @span@~L~projLabel(o.projectId)~R~@/span@
                          @span className=~S~tag tag-cyan~S~@ORDER_~L~o.id~R~@/span@
                          ~L~orderStatusTag(o.status)~R~
                        @/div@
                        @p style=~L~~L~ color: ~S~var(--text-dim)~S~, fontSize: 12, margin: ~S~6px 0 12px~S~ ~R~~R~@
                          ~L~projMeta(o.projectId)~R~
                        @/p@
                        @button type=~S~button~S~ className=~S~btn btn-ghost~S~ style=~L~~L~ fontSize: 12 ~R~~R~
                          onClick=~L~() => setBidFor(bidFor === o.id ? null : o.id)~R~@
                          ~L~bidFor === o.id ? ~S~Close~S~ : ~S~Place Bid~S~~R~
                        @/button@
                        ~L~bidFor === o.id && (~R~
                          @div style=~L~~L~ marginTop: 12, display: ~S~grid~S~, gap: 8 ~R~~R~@
                            @input className=~S~input~S~ placeholder=~S~Amount~S~ value=~L~bidAmount~R~ onChange=~L~e => setBidAmount(e.target.value)~R~ /@
                            @input className=~S~input~S~ placeholder=~S~Weeks~S~ value=~L~bidWeeks~R~ onChange=~L~e => setBidWeeks(e.target.value)~R~ /@
                            @input className=~S~input~S~ placeholder=~S~Note~S~ value=~L~bidNote~R~ onChange=~L~e => setBidNote(e.target.value)~R~ /@
                            @button type=~S~button~S~ className=~S~btn btn-primary~S~ disabled=~L~busy || !bidAmount.trim() || !bidWeeks.trim()~R~
                              onClick=~L~() => void submitBid(o.id)~R~@
                              ~L~busy ? ~S~Submitting...~S~ : ~S~Submit Bid~S~~R~
                            @/button@
                          @/div@
                        ~R~~R~
                      @/div@
                    ~R~~R~
                  ~R~~R~
                @/@
              ~R~~R~
              ~L~tab === ~S~bids~S~ && (~R~
                myBids.length === 0 ? (
                  @div className=~S~panel empty-state~S~@@p@No bids yet@/p@@/div@
                ) : (
                  @div className=~S~panel~S~@
                    @div className=~S~panel-title~S~@@div className=~S~accent-bar~S~ /@@span@My Bids@/span@@/div@
                    @table style=~L~~L~ width: ~S~100%~S~, fontSize: 12, borderCollapse: ~S~collapse~S~ ~R~~R~@
                      @thead@
                        @tr@
                          @th style=~L~~L~ textAlign: ~S~left~S~, padding: ~S~8px 6px~S~, color: ~S~var(--text-dim)~S~ ~R~~R~@Project@/th@
                          @th style=~L~~L~ textAlign: ~S~left~S~, padding: ~S~8px 6px~S~, color: ~S~var(--text-dim)~S~ ~R~~R~@Amount@/th@
                          @th style=~L~~L~ textAlign: ~S~left~S~, padding: ~S~8px 6px~S~, color: ~S~var(--text-dim)~S~ ~R~~R~@Weeks@/th@
                          @th style=~L~~L~ textAlign: ~S~left~S~, padding: ~S~8px 6px~S~, color: ~S~var(--text-dim)~S~ ~R~~R~@Status@/th@
                          @th style=~L~~L~ textAlign: ~S~left~S~, padding: ~S~8px 6px~S~, color: ~S~var(--text-dim)~S~ ~R~~R~@Date@/th@
                        @/tr@
                      @/thead@
                      @tbody@
                        ~L~myBids.map(b => (~R~
                          @tr key=~L~b.id~R~ style=~L~~L~ borderTop: ~S~1px solid var(--border)~S~ ~R~~R~@
                            @td style=~L~~L~ padding: ~S~8px 6px~S~ ~R~~R~@~L~b.projectName~R~@/td@
                            @td style=~L~~L~ padding: ~S~8px 6px~S~ ~R~~R~@~L~b.amount~R~@/td@
                            @td style=~L~~L~ padding: ~S~8px 6px~S~ ~R~~R~@~L~b.weeks~R~@/td@
                            @td style=~L~~L~ padding: ~S~8px 6px~S~ ~R~~R~@~L~bidStatusTag(b.status)~R~@/td@
                            @td style=~L~~L~ padding: ~S~8px 6px~S~, color: ~S~var(--text-dim)~S~ ~R~~R~@~L~(b.createdAt || ~S~~S~).slice(0, 10)~R~@/td@
                          @/tr@
                        ~R~~R~
                      @/tbody@
                    @/table@
                  @/div@
                )
              ~R~~R~
              ~L~tab === ~S~orders~S~ && (~R~
                myOrders.length === 0 ? (
                  @div className=~S~panel empty-state~S~@@p@No orders yet@/p@@/div@
                ) : (
                  myOrders.map(o => (
                    @div key=~L~o.id~R~ className=~S~panel~S~ style=~L~~L~ marginBottom: 12 ~R~~R~@
                      @div className=~S~panel-title~S~@
                        @div className=~S~accent-bar~S~ /@
                        @span@~L~projLabel(o.projectId)~R~@/span@
                        @span className=~S~tag tag-cyan~S~@ORDER_~L~o.id~R~@/span@
                        ~L~orderStatusTag(o.status)~R~
                      @/div@
                      @p style=~L~~L~ color: ~S~var(--text-dim)~S~, fontSize: 12, margin: ~S~6px 0 12px~S~ ~R~~R~@
                        ~L~projMeta(o.projectId)~R~
                        ~L~o.bidAmount ? ~S~ / Bid ~S~ + o.bidAmount : ~S~~S~~R~
                        ~L~o.bidWeeks ? ~S~ / ~S~ + o.bidWeeks + ~S~ weeks~S~ : ~S~~S~~R~
                      @/p@
                      @div style=~L~~L~ display: ~S~flex~S~, gap: 8, flexWrap: ~S~wrap~S~ ~R~~R~@
                        ~L~(o.status === ~S~matched~S~ || o.status === ~S~homeowner_confirmed~S~) && (~R~
                          @button type=~S~button~S~ className=~S~btn btn-primary~S~ disabled=~L~busy~R~
                            onClick=~L~() => void confirmOrder(o.id)~R~@
                            ~L~busy ? ~S~Working...~S~ : ~S~Confirm Order~S~~R~
                          @/button@
                        ~R~~R~
                        ~L~(o.status === ~S~confirmed~S~ || o.status === ~S~contracted~S~) && (~R~
                          @button type=~S~button~S~ className=~S~btn btn-ghost~S~ disabled=~L~busy~R~ onClick=~L~() => void viewContract(o.id)~R~@
                            View Contract
                          @/button@
                        ~R~~R~
                      @/div@
                    @/div@
                  ~R~~R~
                )
              ~R~~R~
              ~L~contractFor !== null && (~R~
                @div style=~L~~L~ position: ~S~fixed~S~, inset: 0, zIndex: 80, display: ~S~flex~S~ ~R~~R~@
                  @div className=~S~panel~S~ style=~L~~L~ maxWidth: 720, width: ~S~100%~S~, maxHeight: ~S~80vh~S~, overflow: ~S~auto~S~ ~R~~R~@
                    @div className=~S~panel-title~S~@@div className=~S~accent-bar~S~ /@@span@Contract ORDER_~L~contractFor~R~@/span@@/div@
                    @pre style=~L~~L~ whiteSpace: ~S~pre-wrap~S~, fontSize: 12, color: ~S~var(--text-dim)~S~, margin: ~S~12px 0~S~ ~R~~R~@
                      ~L~contractText~R~
                    @/pre@
                    @div style=~L~~L~ display: ~S~flex~S~, gap: 8, justifyContent: ~S~flex-end~S~ ~R~~R~@
                      @button type=~S~button~S~ className=~S~btn btn-ghost~S~ onClick=~L~() => setContractFor(null)~R~@Close@/button@
                      @button type=~S~button~S~ className=~S~btn btn-primary~S~ disabled=~L~busy~R~
                        onClick=~L~() => void signContract(contractFor)~R~@
                        Sign as Company
                      @/button@
                    @/div@
                  @/div@
                @/div@
              ~R~~R~
            @/@
          ~R~~R~
        @/@
      ~R~~R~
    @/main@
  );
}
