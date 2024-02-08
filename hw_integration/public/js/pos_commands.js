frappe.ui.POSCommandsBuilder = class extends frappe.ui.POSCommandsBuilder {
	async _complete_transaction(profile_id, pos_invoice_name) {
		super._complete_transaction(profile_id, pos_invoice_name);
		var profile = hwi.qz.hw_profile;
		if (profile?.port) {
			var txn_line1 = profile.txn_end_line_1;
			var txn_line2 = profile.txn_end_line_2;
			hwi.qz.send_comm_data(profile.port, txn_line1, txn_line2);
		}
	}
	print_receipt(reference_doctype, reference_docname, pos_print_format) {
		var me = this;
		if (!reference_docname || !pos_print_format) return;
		if (hwi.raw_printer) {
			me.get_raw_commands(
				reference_doctype,
				reference_docname,
				pos_print_format,
				function (out) {
					hwi.qz
						.qz_connect()
						.then(function () {
							var printData;
							var profile = hwi.qz.hw_profile;
							var opts = {
								language: profile.raw_lang_txn,
								x: profile.txn_x,
								y: profile.txn_y,
								dotDensity: profile.txn_dot_density,
								xmlTag: profile.txn_xml_tag,
								pageWidth: profile.txn_render_width,
								pageHeight: profile.txn_render_height,
							};
							if (out.raw_printing) {
								printData = [out.print_data];
							} else {
								console.log(opts);
								switch (opts.language) {
									case "EPL":
										printData = [
											"\nN\n",
											"q812\n",
											"Q1218,26\n",
											{
												type: "raw",
												format: "html",
												flavor: "plain",
												data: out.print_data,
												options: opts,
											},
											"\nP1,1\n",
										];
										break;
									case "ZPL":
										printData = [
											"^XA\n",
											{
												type: "raw",
												format: "html",
												flavor: "plain",
												data: out.print_data,
												options: opts,
											},
											"^XZ\n",
										];
										break;
									case "ESCPOS":
										printData = [
											{
												type: "raw",
												format: "html",
												flavor: "plain",
												data: out.print_data,
												options: opts,
											},
											"\x0A" + "\x0A" + "\x0A",
											"\x1B" + "\x69",
										];
										break;
									default:
										frappe.throw(
											"Cannot print HTML using this printer language"
										);
										break;
								}
							}
							let config = qz.configs.create(hwi.raw_printer);
							return qz.print(config, printData);
						})
						.then(frappe.ui.form.qz_success)
						.catch((err) => {
							frappe.ui.form.qz_fail(err);
						});
				}
			);
		} else {
			frappe.utils.print(
				reference_doctype,
				reference_docname,
				pos_print_format,
				0,
				frappe.boot.lang
			);
		}
	}
	get_raw_commands(reference_doctype, reference_docname, pos_print_format, callback) {
		frappe.call({
			method: "hw_integration.utils.print.get_print_content",
			args: {
				reference_doctype: reference_doctype,
				reference_docname: reference_docname,
				print_format: pos_print_format,
			},
			callback: function (r) {
				if (!r.exc) {
					callback(r.message);
				}
			},
		});
	}
	close_transaction(me, pos_invoice) {
		super.close_transaction(me, pos_invoice);
		hwi.qz.get_pos_hw_profile(me.pos_profile).then((profile) => {
			if (profile) {
				hwi.qz.send_comm_data(profile.port, profile.wlc_line_1, profile.wlc_line_2);
			}
		});
	}
	get_weight_from_machine() {
		return hwi.get_weight();
	}
};
